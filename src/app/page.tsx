import { redirect } from 'next/navigation';

export default function Home() {
  // The middleware.ts file handles all routing and security.
  // If a user somehow reaches this page, force them to the login screen.
  redirect('/login');
}