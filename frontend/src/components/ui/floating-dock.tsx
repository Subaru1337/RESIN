"use client";
import { cn } from "@/lib/utils";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

export interface DockItem {
  title: string;
  icon: React.ReactNode;
  href: string;
  onClick?: () => void;
}

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: DockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
}) => {
  return (
    <>
      <FloatingDockVerticalDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
};

const FloatingDockVerticalDesktop = ({
  items,
  className,
}: {
  items: DockItem[];
  className?: string;
}) => {
  const mouseY = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseY.set(e.clientY)}
      onMouseLeave={() => mouseY.set(Infinity)}
      className={cn(
        "fixed left-6 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col items-center gap-3.5 select-none pointer-events-auto",
        className
      )}
    >
      {items.map((item) => (
        <VerticalIconContainer mouseY={mouseY} key={item.title} {...item} />
      ))}
    </motion.div>
  );
};

function VerticalIconContainer({
  mouseY,
  title,
  icon,
  href,
  onClick,
}: {
  mouseY: MotionValue;
  title: string;
  icon: React.ReactNode;
  href: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isActive =
    href === "/"
      ? location.pathname === "/"
      : location.pathname === href || location.pathname.startsWith(`${href}/`);

  const distance = useTransform(mouseY, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 };
    return val - bounds.y - bounds.height / 2;
  });

  // Aceternity magnification: [40, 80, 40]
  const widthTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);

  // Icon scaling: [20, 40, 20]
  const widthTransformIcon = useTransform(distance, [-150, 0, 150], [20, 40, 20]);
  const heightTransformIcon = useTransform(distance, [-150, 0, 150], [20, 40, 20]);

  // Outward pop towards the right when hovered
  const xTransform = useTransform(distance, [-150, 0, 150], [0, 22, 0]);

  const width = useSpring(widthTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const height = useSpring(heightTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const widthIcon = useSpring(widthTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const heightIcon = useSpring(heightTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const x = useSpring(xTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const [hovered, setHovered] = useState(false);

  return (
    <Link
      to={href}
      onClick={onClick}
      className="relative flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
    >
      <motion.div
        ref={ref}
        style={{ width, height, x }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "relative flex aspect-square items-center justify-center rounded-full transition-colors duration-200 select-none shadow-md hover:shadow-xl",
          isActive
            ? "bg-foreground text-background shadow-lg shadow-foreground/25 font-semibold"
            : "bg-white/90 dark:bg-neutral-800/90 text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white backdrop-blur-md border border-black/[0.08] dark:border-white/10"
        )}
      >
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, x: -8, y: "-50%" }}
              animate={{ opacity: 1, x: 0, y: "-50%" }}
              exit={{ opacity: 0, x: -4, y: "-50%" }}
              transition={{ duration: 0.15 }}
              className="pointer-events-none absolute left-full ml-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-gray-200 bg-gray-100 dark:border-neutral-900 dark:bg-neutral-800 px-2.5 py-1 text-xs text-neutral-700 dark:text-white shadow-lg z-50"
            >
              {title}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          style={{ width: widthIcon, height: heightIcon }}
          className="flex items-center justify-center"
        >
          {icon}
        </motion.div>
      </motion.div>
    </Link>
  );
}

const FloatingDockMobile = ({
  items,
  className,
}: {
  items: DockItem[];
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className={cn("fixed bottom-6 left-6 z-50 block md:hidden", className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            layoutId="mobile-dock"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="absolute bottom-full mb-3 left-0 flex flex-col gap-2 rounded-2xl border border-gray-200 bg-gray-50/95 dark:border-neutral-800 dark:bg-neutral-900/95 backdrop-blur-xl p-2 shadow-2xl"
          >
            {items.map((item, idx) => {
              const isActive =
                item.href === "/"
                  ? location.pathname === "/"
                  : location.pathname === item.href;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ delay: idx * 0.04 }}
                >
                  <Link
                    to={item.href}
                    onClick={() => {
                      if (item.onClick) item.onClick();
                      setOpen(false);
                    }}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                      isActive
                        ? "bg-foreground text-background"
                        : "bg-gray-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    )}
                    title={item.title}
                  >
                    <div className="h-5 w-5 flex items-center justify-center">{item.icon}</div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 shadow-xl hover:scale-105 active:scale-95 transition-transform"
        aria-label="Toggle navigation menu"
      >
        {open ? <X className="h-5 w-5 text-neutral-700 dark:text-neutral-300" /> : <Menu className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />}
      </button>
    </div>
  );
};

export default FloatingDock;
