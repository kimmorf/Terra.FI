# Terra.FI

A modern full-stack application built with Next.js, Elysia, and Better Auth.

## Tech Stack

- **Next.js 14** - React framework with App Router
- **Elysia** - Fast Bun web framework
- **Better Auth** - Modern authentication solution
- **TypeScript** - Type-safe development
- **Prisma** - Database ORM (PostgreSQL)

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- PostgreSQL database

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd Terra.FI
```

2. Install dependencies:
```bash
npm install
# or
bun install
```

3. Set up environment variables:

Create a `.env` file in the root directory with the following variables:
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/terra_fi"

# Better Auth
BETTER_AUTH_SECRET="your-secret-key-here-change-in-production"
BETTER_AUTH_URL="http://localhost:3000"

# Elysia Server
ELYSIA_PORT=3001

# Next.js
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Optional: GitHub OAuth (if using social login)
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
```

**Important:** Generate a secure random string for `BETTER_AUTH_SECRET`. You can use:
```bash
openssl rand -base64 32
```

4. Set up the database:
```bash
npx prisma generate
npx prisma migrate dev
```

5. Run the development servers:

Terminal 1 - Next.js:
```bash
npm run dev
```

Terminal 2 - Elysia server:
```bash
npm run server
```

The application will be available at:
- Next.js: http://localhost:3000
- Elysia API: http://localhost:3001

## Project Structure

```
├── app/                 # Next.js app directory
│   ├── api/            # API routes
│   ├── auth/           # Authentication pages
│   └── page.tsx        # Home page
├── lib/                # Shared libraries
│   ├── auth.ts         # Better Auth server config
│   ├── auth-client.ts  # Better Auth client
│   └── prisma.ts       # Prisma client
├── server/             # Elysia server
│   └── index.ts        # Elysia server entry point
└── prisma/             # Prisma schema and migrations
```

## Features

- ✅ User authentication (email/password)
- ✅ Social authentication (GitHub - configurable)
- ✅ Elysia API server
- ✅ TypeScript support
- ✅ Modern UI with Tailwind CSS

## Development

- `npm run dev` - Start Next.js development server
- `npm run server` - Start Elysia server
- `npm run build` - Build for production
- `npm run start` - Start production server

## License

MIT

