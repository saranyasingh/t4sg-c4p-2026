import { cn } from "@/lib/utils";
import NavLinks from "./nav-links";

export default function Navbar({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <NavLinks className={cn(className)} {...props} />;
}
