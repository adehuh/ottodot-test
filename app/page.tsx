import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Ottodot — Trial Booking</h1>
      <ul className="mt-6 space-y-2">
        <li>
          <Link className="text-blue-700 underline" href="/book">
            Book a trial class
          </Link>
        </li>
      </ul>
    </main>
  );
}
