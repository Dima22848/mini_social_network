// Реалистичный seed для демонстрации проекта: пользователи, связи, посты, чаты и настоящие файлы в uploads/seed.
import 'dotenv/config'
import {
  ChatMemberRole,
  ChatType,
  FileAssetStatus,
  FileAssetType,
  FollowSource,
  FriendRequestStatus,
  PrismaClient,
} from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as bcrypt from 'bcrypt'
import { statSync } from 'fs'
import { join } from 'path'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})

const prisma = new PrismaClient({
  adapter,
})

const defaultPassword = '12345678'

type SeedUserInput = {
  email: string
  username: string
  bio: string
  age: number
  city: string
  country: string
  avatarUrl?: string
}

type SeedFileInput = {
  type: FileAssetType
  url: string
  thumbnailUrl?: string
  filename: string
  mimeType: string
  sizeBytes: number
  width?: number
  height?: number
  duration?: number
}

function getSeedFileSize(filename: string) {
  return statSync(join(process.cwd(), 'uploads', 'seed', filename)).size
}

function seedFile(
  type: FileAssetType,
  filename: string,
  mimeType: string,
  extra: Partial<Omit<SeedFileInput, 'type' | 'url' | 'filename' | 'mimeType' | 'sizeBytes'>> = {},
): SeedFileInput {
  return {
    type,
    url: `/uploads/seed/${filename}`,
    filename,
    mimeType,
    sizeBytes: getSeedFileSize(filename),
    ...extra,
  }
}

function getFriendshipPair(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort() as [string, string]
}

async function clearDatabase() {
  console.log('Clearing database...')

  await prisma.notificationPreference.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.emailOutbox.deleteMany()

  await prisma.messageRead.deleteMany()
  await prisma.messageReaction.deleteMany()
  await prisma.messageAttachment.deleteMany()
  await prisma.message.deleteMany()
  await prisma.chatInvite.deleteMany()
  await prisma.chatMember.deleteMany()
  await prisma.chat.deleteMany()

  await prisma.postCommentReaction.deleteMany()
  await prisma.postReaction.deleteMany()
  await prisma.postComment.deleteMany()
  await prisma.postAttachment.deleteMany()
  await prisma.post.deleteMany()

  await prisma.fileAsset.deleteMany()

  await prisma.friendRequest.deleteMany()
  await prisma.follow.deleteMany()
  await prisma.friendship.deleteMany()

  await prisma.session.deleteMany()
  await prisma.oAuthAccount.deleteMany()
  await prisma.userProfile.deleteMany()
  await prisma.user.deleteMany()

  console.log('Database cleared.')
}

async function createUser(data: SeedUserInput) {
  const passwordHash = await bcrypt.hash(defaultPassword, 10)

  return prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      passwordHash,
      isEmailVerified: true,
      profile: {
        create: {
          bio: data.bio,
          age: data.age,
          city: data.city,
          country: data.country,
          avatarUrl: data.avatarUrl ?? null,
        },
      },
    },
    include: {
      profile: true,
    },
  })
}

async function createFriendship(firstUserId: string, secondUserId: string) {
  const [userAId, userBId] = getFriendshipPair(firstUserId, secondUserId)

  return prisma.friendship.create({
    data: {
      userAId,
      userBId,
    },
  })
}

async function createFollow(followerId: string, followingId: string) {
  if (followerId === followingId) {
    return
  }

  return prisma.follow.create({
    data: {
      followerId,
      followingId,
      source: FollowSource.FRIEND_REQUEST_IGNORING,
    },
  })
}

async function createFriendRequest(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) {
    return
  }

  return prisma.friendRequest.create({
    data: {
      fromUserId,
      toUserId,
      status: FriendRequestStatus.PENDING,
    },
  })
}

async function createFileAsset(uploadedById: string, data: SeedFileInput) {
  return prisma.fileAsset.create({
    data: {
      uploadedById,
      type: data.type,
      status: FileAssetStatus.READY,
      url: data.url,
      thumbnailUrl: data.thumbnailUrl ?? null,
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      width: data.width ?? null,
      height: data.height ?? null,
      duration: data.duration ?? null,
    },
  })
}

async function createPostWithAttachments(data: {
  authorId: string
  content: string
  files: SeedFileInput[]
}) {
  const post = await prisma.post.create({
    data: {
      authorId: data.authorId,
      content: data.content,
    },
  })

  for (const [index, fileData] of data.files.entries()) {
    const file = await createFileAsset(data.authorId, fileData)

    await prisma.postAttachment.create({
      data: {
        postId: post.id,
        fileId: file.id,
        sortOrder: index,
      },
    })
  }

  return post
}


async function createDirectChatWithMessages(data: {
  firstUserId: string
  secondUserId: string
  messages: { senderId: string; content: string; minutesAgo: number; parentIndex?: number; pinned?: boolean; file?: SeedFileInput }[]
}) {
  const directKey = [data.firstUserId, data.secondUserId].sort().join(':')

  const chat = await prisma.chat.create({
    data: {
      type: ChatType.DIRECT,
      directKey,
      createdById: data.firstUserId,
      members: {
        create: [
          { userId: data.firstUserId, role: ChatMemberRole.OWNER, lastReadAt: new Date() },
          { userId: data.secondUserId, role: ChatMemberRole.MEMBER, lastReadAt: new Date() },
        ],
      },
    },
  })

  const createdMessages: { id: string; createdAt: Date }[] = []

  for (const message of data.messages) {
    const createdAt = new Date(Date.now() - message.minutesAgo * 60 * 1000)
    const created = await prisma.message.create({
      data: {
        chatId: chat.id,
        senderId: message.senderId,
        content: message.content,
        type: message.file ? 'TEXT_WITH_MEDIA' : 'TEXT',
        parentId: message.parentIndex !== undefined ? createdMessages[message.parentIndex]?.id : undefined,
        pinnedAt: message.pinned ? createdAt : null,
        pinnedById: message.pinned ? data.firstUserId : null,
        createdAt,
        updatedAt: createdAt,
      },
    })

    if (message.file) {
      const file = await createFileAsset(message.senderId, message.file)

      await prisma.messageAttachment.create({
        data: {
          messageId: created.id,
          fileId: file.id,
        },
      })
    }

    await prisma.messageRead.createMany({
      data: [
        { messageId: created.id, userId: data.firstUserId, readAt: new Date() },
        { messageId: created.id, userId: data.secondUserId, readAt: new Date() },
      ],
      skipDuplicates: true,
    })

    createdMessages.push({ id: created.id, createdAt })
  }

  const last = createdMessages[createdMessages.length - 1]
  await prisma.chat.update({
    where: { id: chat.id },
    data: { lastMessageId: last?.id, lastMessageAt: last?.createdAt },
  })

  return chat
}

async function createGroupChatWithMessages(data: {
  title: string
  avatarUrl?: string
  ownerId: string
  adminIds: string[]
  memberIds: string[]
  messages: { senderId: string; content: string; minutesAgo: number; pinned?: boolean; file?: SeedFileInput }[]
}) {
  const allMemberIds = [...new Set([data.ownerId, ...data.adminIds, ...data.memberIds])]

  const chat = await prisma.chat.create({
    data: {
      type: ChatType.GROUP,
      title: data.title,
      avatarUrl: data.avatarUrl ?? null,
      createdById: data.ownerId,
      members: {
        create: allMemberIds.map((userId) => ({
          userId,
          role: userId === data.ownerId ? ChatMemberRole.OWNER : data.adminIds.includes(userId) ? ChatMemberRole.ADMIN : ChatMemberRole.MEMBER,
          lastReadAt: new Date(),
        })),
      },
    },
  })

  const createdMessages: { id: string; createdAt: Date }[] = []

  for (const message of data.messages) {
    const createdAt = new Date(Date.now() - message.minutesAgo * 60 * 1000)
    const created = await prisma.message.create({
      data: {
        chatId: chat.id,
        senderId: message.senderId,
        content: message.content,
        type: message.file ? 'TEXT_WITH_MEDIA' : 'TEXT',
        pinnedAt: message.pinned ? createdAt : null,
        pinnedById: message.pinned ? data.ownerId : null,
        createdAt,
        updatedAt: createdAt,
      },
    })

    if (message.file) {
      const file = await createFileAsset(message.senderId, message.file)
      await prisma.messageAttachment.create({
        data: { messageId: created.id, fileId: file.id },
      })
    }

    await prisma.messageRead.createMany({
      data: allMemberIds.map((userId) => ({ messageId: created.id, userId, readAt: new Date() })),
      skipDuplicates: true,
    })

    createdMessages.push({ id: created.id, createdAt })
  }

  const last = createdMessages[createdMessages.length - 1]
  await prisma.chat.update({
    where: { id: chat.id },
    data: { lastMessageId: last?.id, lastMessageAt: last?.createdAt },
  })

  return chat
}

async function main() {
  console.log('Start seed...')

  await clearDatabase()

  const dima = await createUser({
    email: 'dima@example.com',
    username: 'dima',
    bio: 'Люблю fullstack-разработку, аккуратные интерфейсы, NestJS, Next.js и нормальную архитектуру.',
    age: 24,
    city: 'Odesa',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/dima.png',
  })

  const olga = await createUser({
    email: 'olga.tasting@example.com',
    username: 'olga_tasting',
    bio: 'Люблю бургундию, итальянскую кухню и уютные дегустации.',
    age: 27,
    city: 'Kyiv',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/olga.png',
  })

  const andrey = await createUser({
    email: 'somov.andrey@example.com',
    username: 'somov_andrey',
    bio: 'Коллекционирую виски и ромы. Иногда пишу короткие обзоры.',
    age: 31,
    city: 'Lviv',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/andrey.png',
  })

  const kate = await createUser({
    email: 'kate.lavie@example.com',
    username: 'kate_lavie',
    bio: 'Путешествую и дегустирую по всему миру. Люблю винные маршруты.',
    age: 29,
    city: 'Paris',
    country: 'France',
    avatarUrl: '/uploads/seed/avatars/kate.png',
  })

  const sergey = await createUser({
    email: 'sergey.taste@example.com',
    username: 'sergey_taste',
    bio: 'Люблю крепкий алкоголь, сигары и редкие релизы.',
    age: 34,
    city: 'Warsaw',
    country: 'Poland',
    avatarUrl: '/uploads/seed/avatars/sergey.png',
  })

  const maria = await createUser({
    email: 'maria.vino@example.com',
    username: 'maria_vino',
    bio: 'Винный эксперт и автор небольшого винного блога.',
    age: 30,
    city: 'Rome',
    country: 'Italy',
    avatarUrl: '/uploads/seed/avatars/maria.png',
  })

  const nikolay = await createUser({
    email: 'nikolay.taste@example.com',
    username: 'nikolay_taste',
    bio: 'Пишу короткие заметки о дегустациях и новых бутылках.',
    age: 26,
    city: 'Odesa',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/nikolay.png',
  })

  const anna = await createUser({
    email: 'anna.wine@example.com',
    username: 'anna_wine',
    bio: 'Шампанское, сыр и хорошие разговоры — мой идеальный вечер.',
    age: 28,
    city: 'Prague',
    country: 'Czech Republic',
    avatarUrl: '/uploads/seed/avatars/anna.png',
  })

  const victor = await createUser({
    email: 'victor.whisky@example.com',
    username: 'victor_whisky',
    bio: 'Фанат островного виски и торфяных ароматов.',
    age: 33,
    city: 'Berlin',
    country: 'Germany',
    avatarUrl: '/uploads/seed/avatars/victor.png',
  })

  const julia = await createUser({
    email: 'julia.tasting@example.com',
    username: 'julia_tasting',
    bio: 'Люблю гастрономические пары и красивые винные истории.',
    age: 25,
    city: 'Barcelona',
    country: 'Spain',
    avatarUrl: '/uploads/seed/avatars/julia.png',
  })

  const pavel = await createUser({
    email: 'pavel.cocktails@example.com',
    username: 'pavel_cocktails',
    bio: 'Коктейли, bitters, лёд и баланс вкуса.',
    age: 32,
    city: 'Odesa',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/pavel.png',
  })

  const ira = await createUser({
    email: 'ira.sommelier@example.com',
    username: 'ira_sommelier',
    bio: 'Собираю идеи для винных вечеров и люблю тихие бары.',
    age: 27,
    city: 'Kharkiv',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/ira.png',
  })

  const max = await createUser({
    email: 'max.craft@example.com',
    username: 'max_craft',
    bio: 'Пишу про крафтовое пиво, закуски и хорошие пабы.',
    age: 29,
    city: 'Dnipro',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/max.png',
  })

  const sofia = await createUser({
    email: 'sofia.mix@example.com',
    username: 'sofia_mix',
    bio: 'Люблю коктейльную эстетику, джин и красивые бокалы.',
    age: 26,
    city: 'Vienna',
    country: 'Austria',
    avatarUrl: '/uploads/seed/avatars/sofia.png',
  })

  const artem = await createUser({
    email: 'artem.bar@example.com',
    username: 'artem_bar',
    bio: 'Интересуюсь барной культурой, текилой и домашними сетами.',
    age: 30,
    city: 'Lisbon',
    country: 'Portugal',
    avatarUrl: '/uploads/seed/avatars/artem.png',
  })

  const mark = await createUser({
    email: 'mark.routes@example.com',
    username: 'mark_routes',
    bio: 'Ищу винные маршруты и редкие атмосферные места.',
    age: 35,
    city: 'Tbilisi',
    country: 'Georgia',
    avatarUrl: '/uploads/seed/avatars/kate.png',
  })

  const lena = await createUser({
    email: 'lena.cider@example.com',
    username: 'lena_cider',
    bio: 'Люблю сидр, легкие закуски и уютные летние террасы.',
    age: 24,
    city: 'Lviv',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/anna.png',
  })

  const roman = await createUser({
    email: 'roman.rum@example.com',
    username: 'roman_rum',
    bio: 'Коллекционирую ром и редкие истории о напитках.',
    age: 31,
    city: 'Riga',
    country: 'Latvia',
    avatarUrl: '/uploads/seed/avatars/max.png',
  })

  const tanya = await createUser({
    email: 'tanya.sparkling@example.com',
    username: 'tanya_sparkling',
    bio: 'Игристое, десерты и красивые подборки для праздников.',
    age: 27,
    city: 'Warsaw',
    country: 'Poland',
    avatarUrl: '/uploads/seed/avatars/julia.png',
  })


  const newDenis = await createUser({
    email: 'denis.new@example.com',
    username: 'denis_new',
    bio: 'Новый пользователь для проверки поиска друзей без существующих связей.',
    age: 23,
    city: 'Odesa',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/victor.png',
  })

  const newEva = await createUser({
    email: 'eva.routes@example.com',
    username: 'eva_routes',
    bio: 'Ищу интересные маршруты и пока ни с кем не связана.',
    age: 25,
    city: 'Brno',
    country: 'Czech Republic',
    avatarUrl: '/uploads/seed/avatars/anna.png',
  })

  const newBogdan = await createUser({
    email: 'bogdan.nochat@example.com',
    username: 'bogdan_nochat',
    bio: 'Пользователь без чата и подписок для тестирования рекомендаций.',
    age: 28,
    city: 'Kyiv',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/max.png',
  })

  await createUser({
    email: 'marina.discover@example.com',
    username: 'marina_discover',
    bio: 'Новый профиль без связей для проверки поиска новых друзей.',
    age: 24,
    city: 'Odesa',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/olga.png',
  })

  await createUser({
    email: 'alex.nochat@example.com',
    username: 'alex_nochat',
    bio: 'Пока ни с кем не дружит и не подписан — нужен для раздела Найти друзей.',
    age: 27,
    city: 'Kyiv',
    country: 'Ukraine',
    avatarUrl: '/uploads/seed/avatars/victor.png',
  })

  await createUser({
    email: 'nora.tasting@example.com',
    username: 'nora_tasting',
    bio: 'Люблю дегустации, но в seed не имею связей с главным пользователем.',
    age: 26,
    city: 'Warsaw',
    country: 'Poland',
    avatarUrl: '/uploads/seed/avatars/julia.png',
  })

  await createUser({
    email: 'timur.routes@example.com',
    username: 'timur_routes',
    bio: 'Ищу винные маршруты и пока доступен как новый пользователь.',
    age: 29,
    city: 'Tbilisi',
    country: 'Georgia',
    avatarUrl: '/uploads/seed/avatars/kate.png',
  })

  // Друзья dima
  await createFriendship(dima.id, olga.id)
  await createFriendship(dima.id, andrey.id)
  await createFriendship(dima.id, kate.id)

  // Дополнительные связи между другими пользователями, чтобы были общие друзья
  await createFriendship(olga.id, andrey.id)
  await createFriendship(olga.id, maria.id)
  await createFriendship(kate.id, julia.id)
  await createFriendship(ira.id, olga.id)
  await createFriendship(max.id, kate.id)
  await createFriendship(sofia.id, andrey.id)
  await createFriendship(artem.id, olga.id)

  // Только подписчики dima
  await createFollow(maria.id, dima.id)
  await createFollow(sergey.id, dima.id)
  await createFollow(julia.id, dima.id)
  await createFollow(pavel.id, dima.id)

  // Только подписки dima
  await createFollow(dima.id, nikolay.id)
  await createFollow(dima.id, anna.id)
  await createFollow(dima.id, victor.id)


  // Связи с пользователями, с которыми у dima уже есть личные чаты.
  // Так мы не держим в seed личные чаты с полностью посторонними пользователями.
  await createFollow(ira.id, dima.id)
  await createFollow(max.id, dima.id)
  await createFollow(dima.id, sofia.id)
  await createFollow(dima.id, artem.id)
  await createFollow(mark.id, dima.id)
  await createFollow(dima.id, lena.id)
  await createFollow(roman.id, dima.id)
  await createFollow(dima.id, tanya.id)

  // Дополнительные друзья/подписчики без личных чатов — нужны для теста блока "Пользователи без чата".
  await createFriendship(dima.id, newDenis.id)
  await createFollow(newEva.id, dima.id)
  await createFollow(dima.id, newBogdan.id)

  // Заявки в друзья dima.
  // Эти пользователи одновременно являются подписчиками, потому что заявка = подписка + pending request.
  await createFriendRequest(maria.id, dima.id)
  await createFriendRequest(sergey.id, dima.id)
  await createFriendRequest(julia.id, dima.id)

  await createPostWithAttachments({
    authorId: dima.id,
    content:
      'Тестирую профильную ленту: в одном посте есть фото, видео, аудио, обычный файл и архив. Отличный набор для проверки UI.',
    files: [
      {
        type: FileAssetType.IMAGE,
        url: '/uploads/seed/wine-photo.jpg',
        thumbnailUrl: '/uploads/seed/wine-photo.jpg',
        filename: 'wine-photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 420000,
        width: 1200,
        height: 800,
      },
      {
        type: FileAssetType.VIDEO,
        url: '/uploads/seed/tasting-video.mp4',
        thumbnailUrl: '/uploads/seed/tasting-video-preview.jpg',
        filename: 'tasting-video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 2400000,
        duration: 42,
      },
      {
        type: FileAssetType.AUDIO,
        url: '/uploads/seed/podcast-audio.mp3',
        filename: 'podcast-audio.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 980000,
        duration: 86,
      },
      {
        type: FileAssetType.FILE,
        url: '/uploads/seed/tasting-notes.pdf',
        filename: 'tasting-notes.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 310000,
      },
      {
        type: FileAssetType.ARCHIVE,
        url: '/uploads/seed/photos-archive.zip',
        filename: 'photos-archive.zip',
        mimeType: 'application/zip',
        sizeBytes: 760000,
      },
    ],
  })


  await createPostWithAttachments({
    authorId: dima.id,
    content:
      'Собрал отдельный пост про архитектуру проекта: auth refresh, websocket presence, Redis и очередь обработки файлов.',
    files: [
      seedFile(FileAssetType.IMAGE, 'dima-architecture.jpg', 'image/jpeg', {
        thumbnailUrl: '/uploads/seed/dima-architecture.jpg',
        width: 1280,
        height: 820,
      }),
      seedFile(FileAssetType.FILE, 'dima-architecture-notes.pdf', 'application/pdf'),
    ],
  })

  await createPostWithAttachments({
    authorId: dima.id,
    content:
      'Проверяю короткое видео в ленте и превью для медиа. Хочу, чтобы карточка выглядела как настоящая публикация.',
    files: [
      seedFile(FileAssetType.VIDEO, 'dima-ui-demo.mp4', 'video/mp4', {
        thumbnailUrl: '/uploads/seed/dima-ui-demo-preview.jpg',
        duration: 3,
      }),
    ],
  })

  await createPostWithAttachments({
    authorId: dima.id,
    content:
      'Мини-набор для теста вложений: фото рабочего процесса, голосовая заметка, PDF-чеклист и архив с материалами.',
    files: [
      seedFile(FileAssetType.IMAGE, 'dima-workspace.jpg', 'image/jpeg', {
        thumbnailUrl: '/uploads/seed/dima-workspace.jpg',
        width: 1280,
        height: 820,
      }),
      seedFile(FileAssetType.AUDIO, 'dima-audio-note.mp3', 'audio/mpeg', { duration: 3 }),
      seedFile(FileAssetType.FILE, 'dima-tasting-checklist.pdf', 'application/pdf'),
      seedFile(FileAssetType.ARCHIVE, 'dima-media-pack.zip', 'application/zip'),
    ],
  })

  await createPostWithAttachments({
    authorId: dima.id,
    content:
      'Ещё один пост для проверки сетки изображений: чат, лента, маршрут и общая архитектура.',
    files: [
      seedFile(FileAssetType.IMAGE, 'dima-chat-media.jpg', 'image/jpeg', {
        thumbnailUrl: '/uploads/seed/dima-chat-media.jpg',
        width: 1280,
        height: 820,
      }),
      seedFile(FileAssetType.IMAGE, 'dima-feed-design.jpg', 'image/jpeg', {
        thumbnailUrl: '/uploads/seed/dima-feed-design.jpg',
        width: 1280,
        height: 820,
      }),
      seedFile(FileAssetType.IMAGE, 'dima-wine-route.jpg', 'image/jpeg', {
        thumbnailUrl: '/uploads/seed/dima-wine-route.jpg',
        width: 1280,
        height: 820,
      }),
    ],
  })

  await createPostWithAttachments({
    authorId: olga.id,
    content:
      'Нашла классное сочетание: лёгкое красное вино, паста и немного выдержанного сыра.',
    files: [
      {
        type: FileAssetType.IMAGE,
        url: '/uploads/seed/olga-dinner.jpg',
        thumbnailUrl: '/uploads/seed/olga-dinner.jpg',
        filename: 'olga-dinner.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 510000,
        width: 1200,
        height: 900,
      },
    ],
  })

  await createPostWithAttachments({
    authorId: andrey.id,
    content:
      'Добавил в коллекцию редкий ром. Позже сделаю полноценный обзор с заметками.',
    files: [
      {
        type: FileAssetType.FILE,
        url: '/uploads/seed/rum-review.pdf',
        filename: 'rum-review.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 280000,
      },
    ],
  })

  await createPostWithAttachments({
    authorId: kate.id,
    content:
      'Мини-влог из поездки: дегустация, атмосфера и немного музыки на фоне.',
    files: [
      {
        type: FileAssetType.VIDEO,
        url: '/uploads/seed/kate-trip.mp4',
        thumbnailUrl: '/uploads/seed/kate-trip-preview.jpg',
        filename: 'kate-trip.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 3200000,
        duration: 58,
      },
      {
        type: FileAssetType.AUDIO,
        url: '/uploads/seed/kate-audio-note.mp3',
        filename: 'kate-audio-note.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 650000,
        duration: 35,
      },
    ],
  })

  await createPostWithAttachments({
    authorId: maria.id,
    content:
      'Сегодня сравнивала два бордо. Одно оказалось мягче, второе — интереснее по послевкусию.',
    files: [
      {
        type: FileAssetType.IMAGE,
        url: '/uploads/seed/bordeaux-comparison.jpg',
        thumbnailUrl: '/uploads/seed/bordeaux-comparison.jpg',
        filename: 'bordeaux-comparison.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 470000,
        width: 1200,
        height: 800,
      },
    ],
  })

  await createPostWithAttachments({
    authorId: sergey.id,
    content:
      'Короткая заметка про крепкий релиз недели. Аромат мощный, но вкус неожиданно спокойный.',
    files: [
      {
        type: FileAssetType.FILE,
        url: '/uploads/seed/strong-release-notes.pdf',
        filename: 'strong-release-notes.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 190000,
      },
    ],
  })


  await createPostWithAttachments({
    authorId: nikolay.id,
    content:
      'Сделал короткую заметку про оформление карточек товара и как лучше показывать медиа в ленте.',
    files: [
      seedFile(FileAssetType.IMAGE, 'dima-feed-design.jpg', 'image/jpeg', {
        thumbnailUrl: '/uploads/seed/dima-feed-design.jpg',
        width: 1280,
        height: 820,
      }),
    ],
  })

  await createPostWithAttachments({
    authorId: anna.id,
    content:
      'Подборка для тихого вечера: игристое, мягкий сыр и короткая аудиозаметка.',
    files: [
      seedFile(FileAssetType.IMAGE, 'feed-olga-table.jpg', 'image/jpeg', {
        thumbnailUrl: '/uploads/seed/feed-olga-table.jpg',
        width: 1280,
        height: 820,
      }),
      seedFile(FileAssetType.AUDIO, 'chat-voice-idea.mp3', 'audio/mpeg', { duration: 3 }),
    ],
  })

  await createPostWithAttachments({
    authorId: tanya.id,
    content:
      'Показываю короткий видео-луп для проверки видео в чужой ленте.',
    files: [
      seedFile(FileAssetType.VIDEO, 'dima-tasting-loop.mp4', 'video/mp4', {
        thumbnailUrl: '/uploads/seed/dima-tasting-loop-preview.jpg',
        duration: 3,
      }),
    ],
  })


  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: maria.id,
    messages: [
      { senderId: maria.id, content: 'Алексей, добрый день! Спасибо за рекомендацию вина, оно действительно великолепное.', minutesAgo: 80, pinned: true },
      { senderId: dima.id, content: 'Мария, привет! Рад, что вам понравилось. Могу порекомендовать ещё несколько вариантов.', minutesAgo: 70 },
      { senderId: maria.id, content: 'Буду очень благодарна! Особенно интересуют белые вина для летних вечеров.', minutesAgo: 60 },
      { senderId: dima.id, content: 'Попробуйте Sauvignon Blanc, Chardonnay и Riesling. Прикрепил короткий PDF-чеклист.', minutesAgo: 50, parentIndex: 2, file: seedFile(FileAssetType.FILE, 'dima-tasting-checklist.pdf', 'application/pdf') },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: sergey.id,
    messages: [
      { senderId: sergey.id, content: 'Да, конечно, давайте попробуем новый формат дегустации.', minutesAgo: 24 * 60 },
      { senderId: dima.id, content: 'Окей, я подготовлю список бутылок и заметки.', minutesAgo: 23 * 60 },
    ],
  })


  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: olga.id,
    messages: [
      { senderId: olga.id, content: 'Я нашла интересную сырную тарелку под розовое вино.', minutesAgo: 18 * 60 },
      { senderId: dima.id, content: 'Круто, потом добавим это в подборку закусок.', minutesAgo: 17 * 60 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: andrey.id,
    messages: [
      { senderId: andrey.id, content: 'У меня есть таблица по ароматам для виски, скидываю PDF.', minutesAgo: 16 * 60, file: seedFile(FileAssetType.FILE, 'frontend-review.pdf', 'application/pdf') },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: kate.id,
    messages: [
      { senderId: kate.id, content: 'В воскресенье будет мини-дегустация игристого, хочешь присоединиться? Скинула фото настроения.', minutesAgo: 15 * 60, file: seedFile(FileAssetType.IMAGE, 'feed-kate-road.jpg', 'image/jpeg', { thumbnailUrl: '/uploads/seed/feed-kate-road.jpg', width: 1280, height: 820 }) },
      { senderId: dima.id, content: 'Да, звучит интересно. Я в ответ прикрепил короткое видео-превью.', minutesAgo: 14 * 60, file: seedFile(FileAssetType.VIDEO, 'dima-ui-demo.mp4', 'video/mp4', { thumbnailUrl: '/uploads/seed/dima-ui-demo-preview.jpg', duration: 3 }) },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: nikolay.id,
    messages: [
      { senderId: nikolay.id, content: 'Посмотрел новую подборку, оформление стало намного приятнее.', minutesAgo: 13 * 60 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: anna.id,
    messages: [
      { senderId: anna.id, content: 'Можешь подсказать шампанское до 40 долларов?', minutesAgo: 12 * 60 },
      { senderId: dima.id, content: 'Да, подберу несколько вариантов и отправлю списком.', minutesAgo: 11 * 60 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: victor.id,
    messages: [
      { senderId: victor.id, content: 'Торфяной виски зашел, спасибо за рекомендацию.', minutesAgo: 10 * 60 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: julia.id,
    messages: [
      { senderId: julia.id, content: 'Я подготовила пару фото для будущей подборки коктейлей.', minutesAgo: 9 * 60 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: pavel.id,
    messages: [
      { senderId: pavel.id, content: 'Для коктейльной страницы можно добавить фильтр по крепости.', minutesAgo: 8 * 60 },
      { senderId: dima.id, content: 'Отличная мысль, позже вынесем это в отдельную задачу.', minutesAgo: 7 * 60 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: ira.id,
    messages: [
      { senderId: ira.id, content: 'Собираю идеи для тихого винного вечера, можешь подсказать пару бутылок?', minutesAgo: 6 * 60 },
      { senderId: dima.id, content: 'Да, могу подобрать красное и белое под разные закуски.', minutesAgo: 5 * 60 + 40 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: max.id,
    messages: [
      { senderId: max.id, content: 'Крафтовый раздел можно сделать с подборками по стилям.', minutesAgo: 5 * 60 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: sofia.id,
    messages: [
      { senderId: sofia.id, content: 'Нашла красивый сет бокалов для джина, потом скину фото.', minutesAgo: 4 * 60 },
      { senderId: dima.id, content: 'Супер, это пригодится для страницы рекомендаций.', minutesAgo: 3 * 60 + 30 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: artem.id,
    messages: [
      { senderId: artem.id, content: 'Для текилы можно добавить фильтр по выдержке.', minutesAgo: 3 * 60 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: mark.id,
    messages: [
      { senderId: mark.id, content: 'Есть список уютных мест для винного маршрута, могу отправить позже.', minutesAgo: 2 * 60 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: lena.id,
    messages: [
      { senderId: lena.id, content: 'Подскажи, какой сидр лучше взять к мягким сырам?', minutesAgo: 90 },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: roman.id,
    messages: [
      { senderId: roman.id, content: 'Нашел интересный ром с ванильными нотами, прислал фото.', minutesAgo: 75, file: seedFile(FileAssetType.IMAGE, 'dima-wine-route.jpg', 'image/jpeg', { thumbnailUrl: '/uploads/seed/dima-wine-route.jpg', width: 1280, height: 820 }) },
    ],
  })

  await createDirectChatWithMessages({
    firstUserId: dima.id,
    secondUserId: tanya.id,
    messages: [
      { senderId: tanya.id, content: 'Для подборки игристого нужны варианты под десерт. Оставила голосовую заметку.', minutesAgo: 50, file: seedFile(FileAssetType.AUDIO, 'chat-voice-idea.mp3', 'audio/mpeg', { duration: 3 }) },
    ],
  })

  await createGroupChatWithMessages({
    title: 'Wine Lovers Club',
    avatarUrl: '/uploads/seed/avatars/wine-club.png',
    ownerId: dima.id,
    adminIds: [maria.id],
    memberIds: [sergey.id, kate.id, andrey.id, olga.id, anna.id],
    messages: [
      { senderId: dima.id, content: 'Друзья, напоминаю о дегустации в пятницу. Это сообщение закрепляю.', minutesAgo: 3 * 24 * 60, pinned: true },
      { senderId: maria.id, content: 'Я подготовлю подборку белых вин и короткое описание к каждому.', minutesAgo: 2 * 24 * 60, pinned: true },
      {
        senderId: kate.id,
        content: 'Добавляю фото с прошлой дегустации для вдохновения.',
        minutesAgo: 24 * 60,
        file: {
          type: FileAssetType.IMAGE,
          url: '/uploads/seed/group-wine-photo.jpg',
          thumbnailUrl: '/uploads/seed/group-wine-photo.jpg',
          filename: 'group-wine-photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 520000,
          width: 1200,
          height: 800,
        },
      },
      {
        senderId: andrey.id,
        content: 'Я скину свои заметки PDF, там есть хорошая таблица ароматов.',
        minutesAgo: 22 * 60,
        file: {
          type: FileAssetType.FILE,
          url: '/uploads/seed/aroma-table.pdf',
          filename: 'aroma-table.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 260000,
        },
      },
      {
        senderId: olga.id,
        content: 'Записала короткое аудио с идеями для закусок.',
        minutesAgo: 20 * 60,
        file: {
          type: FileAssetType.AUDIO,
          url: '/uploads/seed/snacks-ideas.mp3',
          filename: 'snacks-ideas.mp3',
          mimeType: 'audio/mpeg',
          sizeBytes: 740000,
          duration: 44,
        },
      },
    ],
  })


  await createGroupChatWithMessages({
    title: 'Cocktail Lab',
    avatarUrl: '/uploads/seed/group-cocktail-photo.jpg',
    ownerId: dima.id,
    adminIds: [pavel.id],
    memberIds: [sofia.id, artem.id, olga.id, max.id],
    messages: [
      { senderId: dima.id, content: 'Создал комнату для идей по коктейлям и барной странице.', minutesAgo: 4 * 24 * 60, pinned: true },
      { senderId: sofia.id, content: 'Прикрепляю референс по визуалу карточек.', minutesAgo: 3 * 24 * 60, file: seedFile(FileAssetType.IMAGE, 'group-cocktail-photo.jpg', 'image/jpeg', { thumbnailUrl: '/uploads/seed/group-cocktail-photo.jpg', width: 1280, height: 820 }) },
      { senderId: pavel.id, content: 'Записал короткую аудиозаметку про баланс вкуса.', minutesAgo: 2 * 24 * 60, file: seedFile(FileAssetType.AUDIO, 'group-snack-note.mp3', 'audio/mpeg', { duration: 3 }) },
      { senderId: dima.id, content: 'Добавил архив с материалами для теста вложений.', minutesAgo: 24 * 60, file: seedFile(FileAssetType.ARCHIVE, 'group-assets.zip', 'application/zip') },
    ],
  })

  await createGroupChatWithMessages({
    title: 'Project UI Review',
    avatarUrl: '/uploads/seed/group-dev-photo.jpg',
    ownerId: dima.id,
    adminIds: [kate.id],
    memberIds: [nikolay.id, anna.id, tanya.id, roman.id],
    messages: [
      { senderId: dima.id, content: 'Здесь собираем замечания по интерфейсу и realtime-поведению.', minutesAgo: 6 * 24 * 60, pinned: true },
      { senderId: nikolay.id, content: 'PDF с заметками по фронтенду прикрепил сюда.', minutesAgo: 5 * 24 * 60, file: seedFile(FileAssetType.FILE, 'frontend-review.pdf', 'application/pdf') },
      { senderId: kate.id, content: 'Видео-превью для проверки вкладки вложений.', minutesAgo: 4 * 24 * 60, file: seedFile(FileAssetType.VIDEO, 'group-toast-video.mp4', 'video/mp4', { thumbnailUrl: '/uploads/seed/group-toast-video-preview.jpg', duration: 3 }) },
      { senderId: anna.id, content: 'Фото для визуальной проверки сетки.', minutesAgo: 3 * 24 * 60, file: seedFile(FileAssetType.IMAGE, 'group-dev-photo.jpg', 'image/jpeg', { thumbnailUrl: '/uploads/seed/group-dev-photo.jpg', width: 1280, height: 820 }) },
    ],
  })

  console.log('Seed completed.')
  console.log(`Main user email: ${dima.email}`)
  console.log(`Main user password: ${defaultPassword}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })