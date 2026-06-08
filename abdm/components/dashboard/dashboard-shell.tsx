"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/signout-button";
import { Activity, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

interface DashboardShellProps {
  roleLabel: string;
  groups: NavGroup[];
  active: string;
  onSelect: (id: string) => void;
  userName?: string | null;
  userEmail?: string | null;
  userMeta?: React.ReactNode;
  pageTitle: string;
  pageDescription?: string;
  children: React.ReactNode;
}

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "U").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function DashboardShell({
  roleLabel,
  groups,
  active,
  onSelect,
  userName,
  userEmail,
  userMeta,
  pageTitle,
  pageDescription,
  children,
}: DashboardShellProps) {
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const displayName = userName || userEmail?.split("@")[0] || "there";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r-0 bg-sidebar/80">
        <SidebarHeader className="p-3">
          <div className="ehr-surface p-1 group-data-[collapsible=icon]:rounded-2xl group-data-[collapsible=icon]:p-0.5">
            <div className="ehr-core flex items-center gap-2 px-2.5 py-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
              <div className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_22px_rgba(10,129,145,0.22)]">
                <Activity className="size-4" strokeWidth={1.6} />
              </div>
              <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-semibold tracking-tight">Unified EHR</span>
                <span className="text-[11px] text-muted-foreground">{roleLabel}</span>
              </div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2">
          {groups.map((g) => (
            <SidebarGroup key={g.label} className="py-3">
              <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                {g.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {g.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={active === item.id}
                          tooltip={item.label}
                          onClick={() => onSelect(item.id)}
                          className="h-10 rounded-full px-3 text-muted-foreground transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/10 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-[0_12px_28px_rgba(10,129,145,0.22)] [&_svg]:size-4 [&_svg]:stroke-[1.6]"
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="p-3">
          <div className="ehr-surface p-1 group-data-[collapsible=icon]:hidden">
            <div className="ehr-core flex items-center gap-2 p-2">
              <Avatar className="size-9">
                <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                  {initials(userName, userEmail)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-medium">
                  {userName ?? "Account"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {userEmail ?? ""}
                </span>
              </div>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-3 z-30 mx-3 mt-3 flex h-14 shrink-0 items-center gap-2 rounded-full border border-white/60 bg-background/78 px-3 shadow-[0_18px_54px_rgba(24,52,64,0.10)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 md:mx-6">
          <SidebarTrigger className="-ml-1 rounded-full" />
          <Separator orientation="vertical" className="mr-2 h-4 bg-border/70" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="hidden size-7 items-center justify-center rounded-full bg-accent text-accent-foreground sm:flex">
              <Sparkles className="size-3.5" strokeWidth={1.6} />
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {greeting},{" "}
              <span className="font-medium text-foreground">{displayName}</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 space-y-7 px-4 pb-8 pt-6 md:px-8 md:pb-12">
          <div className="ehr-surface">
            <div className="ehr-core overflow-hidden px-5 py-6 md:px-8 md:py-8">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0 space-y-3">
                  <span className="ehr-eyebrow">{roleLabel}</span>
                  <div className="space-y-1">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                      {pageTitle}
                    </h1>
                    {pageDescription && (
                      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                        {pageDescription}
                      </p>
                    )}
                  </div>
                </div>
                {userMeta && <div className="min-w-0 md:max-w-[48%]">{userMeta}</div>}
              </div>
            </div>
          </div>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
