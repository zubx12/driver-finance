import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Car, LayoutDashboard, Briefcase } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            Driver Finance App
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Select a module below to preview the frontend interfaces.
          </p>
        </div>

        <div className="flex flex-col space-y-4 mt-8">
          <Link href="/driver" className="w-full">
            <Button size="lg" className="w-full h-16 text-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-md gap-3 rounded-xl">
              <Car className="h-6 w-6" />
              Driver App
            </Button>
          </Link>
          
          <Link href="/admin" className="w-full">
            <Button size="lg" variant="outline" className="w-full h-16 text-lg border-zinc-300 dark:border-zinc-700 shadow-sm gap-3 rounded-xl">
              <LayoutDashboard className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
              Admin Dashboard
            </Button>
          </Link>

          <Link href="/partner" className="w-full">
            <Button size="lg" variant="outline" className="w-full h-16 text-lg border-zinc-300 dark:border-zinc-700 shadow-sm gap-3 rounded-xl">
              <Briefcase className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
              Partner Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
