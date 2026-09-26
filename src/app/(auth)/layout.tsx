/* The split screen every auth page sits in: navy panel on the left, form on the
   right. Below 900px the foundation stylesheet drops the panel rather than
   squashing it, and the form becomes the page. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth">{children}</div>;
}
