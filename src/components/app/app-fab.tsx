import Link from "next/link";

type AppFabProps = {
  href: string;
  label?: string;
};

/** FAB centrale “+” sopra la bottom nav. */
export function AppFab({ href, label = "Azione rapida" }: AppFabProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]"
      aria-hidden={false}
    >
      <div className="sm-app-constrain flex w-full justify-center px-3">
        <Link
          href={href}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#3A4254] to-[#4F4A68] text-2xl font-light leading-none text-white shadow-md shadow-black/22 transition duration-200 hover:scale-[1.03] hover:shadow-md active:scale-95 sm:h-14 sm:w-14 sm:text-2xl"
          aria-label={label}
        >
          +
        </Link>
      </div>
    </div>
  );
}
