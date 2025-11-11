import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Welcome to Terra.FI</h1>
        <p className="text-lg text-gray-600">
          Built with Next.js, Elysia, and Better Auth
        </p>
        <div className="flex gap-4 justify-center mt-8">
          <Link
            href="/auth/signin"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            Sign Up
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Dashboard
          </Link>
        </div>
        <div className="mt-8 text-sm text-gray-500">
          <p>Elysia API running on port 3001</p>
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-500 underline"
          >
            View API Documentation
          </a>
        </div>
      </div>
    </main>
  );
}

