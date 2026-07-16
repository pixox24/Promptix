import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { IconClose, IconLogoMark, IconMenu, IconMoon } from '../icons';

const navItems = [
  { to: '/', label: '发现', end: true },
  { to: '/library', label: '模板库' },
  { to: '/my', label: '我的提示词' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50">
      <div className="h-[4.5rem] border-b border-transparent bg-background/75 backdrop-blur transition-all max-lg:h-14">
        <div className="w-full px-4 md:px-8">
          <div className="relative flex flex-wrap items-center justify-between lg:py-5">
            <div className="flex items-center justify-between gap-8 max-lg:h-14 max-lg:w-full">
              <Link
                to="/"
                className="flex items-center gap-3"
                onClick={() => setOpen(false)}
              >
                <div className="flex h-11 w-11 select-none items-center justify-center overflow-hidden rounded-xl bg-primary/90 text-primary-foreground shadow-sm">
                  <IconLogoMark size={28} />
                </div>
                <span className="text-2xl font-semibold tracking-tight text-slate-900">
                  Promptix
                </span>
              </Link>

              <nav className="hidden max-w-max flex-1 items-center lg:flex">
                <ul className="flex flex-1 list-none items-center justify-center gap-2">
                  {navItems.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-muted/50 text-foreground'
                              : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>

              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md lg:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? '关闭菜单' : '打开菜单'}
              >
                {open ? <IconClose size={20} /> : <IconMenu size={20} />}
              </button>
            </div>

            <div className="hidden items-center gap-2 lg:flex">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label="主题"
              >
                <IconMoon size={18} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/my')}
                className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-all hover:brightness-95 active:scale-[0.98]"
              >
                登录
              </button>
            </div>
          </div>
        </div>

        {open && (
          <div className="border-t border-border/60 bg-background px-4 py-3 lg:hidden">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-2.5 text-sm font-medium ${
                      isActive ? 'bg-muted' : 'text-foreground/80'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              onClick={() => {
                setOpen(false);
                navigate('/my');
              }}
            >
              登录
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
