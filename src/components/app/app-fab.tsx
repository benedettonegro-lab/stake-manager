import Link from "next/link";

type AppFabProps = {
  href: string;
  label?: string;
};

/** FAB centrale “+” sopra la bottom nav. */
export function AppFab({ href, label = "Azione rapida" }: AppFabProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]"
      aria-hidden={false}
    >
      <div className="sm-app-constrain flex w-full justify-center px-3">
        <Link
          href={href}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#3d4558] to-[#5c4d7a] text-2xl font-light text-white shadow-md shadow-black/30 transition duration-200 hover:scale-105 hover:shadow-lg active:scale-95"
          aria-label={label}
        >
          +
        </Link>
      </div>
    </div>
  );
}
