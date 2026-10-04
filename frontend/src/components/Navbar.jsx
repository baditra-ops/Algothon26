import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  RefreshCw,
  Compass,
  Menu,
  X
} from 'lucide-react';
import { ConnectionStatus } from './ConnectionStatus';
import { InstallButton } from './InstallButton';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Projects', path: '/projects', icon: FolderKanban },
  { name: 'Tasks', path: '/tasks', icon: CheckSquare },
  { name: 'Sync Center', path: '/sync-center', icon: RefreshCw },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-8">
            <NavLink to="/" className="flex items-center gap-3 group focus:outline-none">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 via-emerald-500 to-teal-700 text-slate-950 shadow-md shadow-emerald-950/40 group-hover:scale-105 group-hover:shadow-teal-500/20 transition-all duration-300">
                <Compass className="h-5 w-5 stroke-[2.5] group-hover:rotate-45 transition-transform duration-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-white group-hover:text-teal-400 transition-colors">
                    FIELDNOTE
                  </span>
                  <span className="hidden sm:inline-block text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-slate-900 text-teal-400/90 border border-teal-500/30 shadow-xs">
                    Workspace
                  </span>
                </div>
              </div>
            </NavLink>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center space-x-1.5" aria-label="Main Navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 group ${
                        isActive
                          ? 'bg-slate-900/90 text-teal-300 shadow-sm border border-teal-500/30 font-semibold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900/50 hover:translate-x-0.5'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`h-4 w-4 transition-transform duration-200 group-hover:scale-110 ${
                            isActive ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                        />
                        <span>{item.name}</span>
                        {isActive && (
                          <span
                            className="absolute -bottom-[17px] left-1/2 -translate-x-1/2 w-6 h-0.5 bg-teal-400 rounded-full shadow-sm shadow-teal-400/50"
                            aria-hidden="true"
                          />
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Right Section: Install button & Connectivity Indicator */}
          <div className="flex items-center gap-3">
            <InstallButton />
            <ConnectionStatus />

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden inline-flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 focus:outline-none transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile navigation menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-800 bg-slate-950/95 backdrop-blur-xl px-4 pt-2 pb-4 space-y-1 animate-page-enter">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800/90 text-teal-300 font-semibold border border-teal-500/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </header>
  );
}

export default Navbar;
