"use client";

import { Check, ChevronRight, Dot } from "lucide-react";
import { ContextMenu as CM, DropdownMenu as DM } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { menu } from "./styles";

/* ---------- Dropdown menu ---------- */

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export const MenuGroup = DM.Group;
export const MenuRadioGroup = DM.RadioGroup;
export const MenuSub = DM.Sub;

export function MenuContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(menu.content, className)}
        {...props}
      />
    </DM.Portal>
  );
}

type ItemExtras = { icon?: ReactNode; shortcut?: string; destructive?: boolean };

function ItemBody({ icon, shortcut, children }: ItemExtras & { children?: ReactNode }) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className={menu.shortcut}>{shortcut}</span>}
    </>
  );
}

export function MenuItem({
  className,
  icon,
  shortcut,
  destructive,
  children,
  ...props
}: ComponentProps<typeof DM.Item> & ItemExtras) {
  return (
    <DM.Item className={cn(menu.item, destructive && menu.destructive, className)} {...props}>
      <ItemBody icon={icon} shortcut={shortcut}>
        {children}
      </ItemBody>
    </DM.Item>
  );
}

export function MenuCheckboxItem({
  className,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof DM.CheckboxItem> & Pick<ItemExtras, "shortcut">) {
  return (
    <DM.CheckboxItem className={cn(menu.item, menu.indicatorItem, className)} {...props}>
      <DM.ItemIndicator className={menu.indicator}>
        <Check />
      </DM.ItemIndicator>
      <ItemBody shortcut={shortcut}>{children}</ItemBody>
    </DM.CheckboxItem>
  );
}

export function MenuRadioItem({
  className,
  icon,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof DM.RadioItem> & ItemExtras) {
  return (
    <DM.RadioItem className={cn(menu.item, menu.indicatorItem, className)} {...props}>
      <DM.ItemIndicator className={menu.indicator}>
        <Dot className="size-6!" strokeWidth={4} />
      </DM.ItemIndicator>
      <ItemBody icon={icon} shortcut={shortcut}>
        {children}
      </ItemBody>
    </DM.RadioItem>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn(menu.label, className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn(menu.separator, className)} {...props} />;
}

export function MenuSubTrigger({
  className,
  icon,
  children,
  ...props
}: ComponentProps<typeof DM.SubTrigger> & Pick<ItemExtras, "icon">) {
  return (
    <DM.SubTrigger className={cn(menu.item, "data-[state=open]:bg-hover", className)} {...props}>
      <ItemBody icon={icon}>{children}</ItemBody>
      <ChevronRight className="ml-auto" />
    </DM.SubTrigger>
  );
}

export function MenuSubContent({ className, ...props }: ComponentProps<typeof DM.SubContent>) {
  return (
    <DM.Portal>
      <DM.SubContent sideOffset={4} collisionPadding={8} className={cn(menu.content, className)} {...props} />
    </DM.Portal>
  );
}

/* ---------- Context menu (right-click) — same visuals ---------- */

export const ContextMenu = CM.Root;
export const ContextMenuTrigger = CM.Trigger;

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof CM.Content>) {
  return (
    <CM.Portal>
      <CM.Content collisionPadding={8} className={cn(menu.content, className)} {...props} />
    </CM.Portal>
  );
}

export function ContextMenuItem({
  className,
  icon,
  shortcut,
  destructive,
  children,
  ...props
}: ComponentProps<typeof CM.Item> & ItemExtras) {
  return (
    <CM.Item className={cn(menu.item, destructive && menu.destructive, className)} {...props}>
      <ItemBody icon={icon} shortcut={shortcut}>
        {children}
      </ItemBody>
    </CM.Item>
  );
}

export function ContextMenuLabel({ className, ...props }: ComponentProps<typeof CM.Label>) {
  return <CM.Label className={cn(menu.label, className)} {...props} />;
}

export function ContextMenuSeparator({ className, ...props }: ComponentProps<typeof CM.Separator>) {
  return <CM.Separator className={cn(menu.separator, className)} {...props} />;
}
