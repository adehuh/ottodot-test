import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-[11px] font-bold tracking-widest text-teal-700 uppercase">
          Ottodot · trial booking
        </p>
        <h1 className="mt-2 text-xl font-bold text-slate-900">Book a trial class</h1>
        <p className="mt-1 text-sm text-slate-500">
          Four seats per class. The database decides who gets the last one.
        </p>
        <Link
          href="/book"
          className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-teal-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          Start a booking
        </Link>
      </div>
    </main>
  );
}
