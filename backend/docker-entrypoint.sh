#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Syncing database schema..."
until npx prisma db push; do
  echo "Database is not ready yet, retrying in 2 seconds..."
  sleep 2
done

if [ "$SEED_ON_START" = "true" ]; then
  echo "Running seed..."
  npm run db:seed
fi

echo "Starting NestJS backend..."
npm run start:dev
