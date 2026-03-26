import NavLinks from "./nav-links";
import { cn } from "@/lib/utils";

export default function Navbar({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <NavLinks className={cn(className)} {...props} />;
}
