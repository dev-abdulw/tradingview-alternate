"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useUi } from "@/features/shell/ui-store";
import type { WatchlistRow } from "@/lib/persistence/schema";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/ui/dialog";
import { IconButton } from "@/ui/icon-button";
import { Input } from "@/ui/input";
import { deleteListWithUndo } from "./watchlist-panel";
import { useWatchlistPrefs } from "./watchlist-prefs";
import { sortedLists, useWatchlists } from "./watchlist-store";

export function RenameListDialog({ listId, onClose }: { listId: string | null; onClose: () => void }) {
  const list = useWatchlists((s) => (listId ? s.lists[listId] : undefined));
  return (
    <Dialog open={listId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Rename list" className="max-w-sm">
        {list && <RenameForm key={list.id} list={list} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** Keyed by list id: the draft is seeded once on mount, never copied in an effect. */
function RenameForm({ list, onClose }: { list: WatchlistRow; onClose: () => void }) {
  const [name, setName] = useState(list.name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    useWatchlists.getState().renameList(list.id, name);
    onClose();
  };
  return (
    <form onSubmit={submit}>
      <DialogBody>
        <Input
          autoFocus
          aria-label="List name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" size="sm" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={!name.trim()}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ManageListsDialog() {
  const open = useUi((s) => s.manageListsOpen);
  const setOpen = useUi((s) => s.setManageListsOpen);
  const listsMap = useWatchlists((s) => s.lists);
  const items = useWatchlists((s) => s.items);
  const lists = useMemo(() => sortedLists(listsMap), [listsMap]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const it of Object.values(items))
      if (it.type === "symbol") c.set(it.watchlist_id, (c.get(it.watchlist_id) ?? 0) + 1);
    return c;
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    useWatchlists.getState().moveList(
      String(e.active.id),
      lists.findIndex((l) => l.id === e.over!.id),
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Manage lists"
        description="Drag to reorder (or focus the handle and use Space + arrow keys)."
        className="max-w-md"
      >
        <DialogBody className="px-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={lists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5">
                {lists.map((l) => (
                  <ListRow key={l.id} list={l} count={counts.get(l.id) ?? 0} canDelete={lists.length > 1} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </DialogBody>
        <DialogFooter className="justify-between">
          <Button
            size="sm"
            onClick={() => useWatchlistPrefs.getState().setActiveList(useWatchlists.getState().createList())}
          >
            New list
          </Button>
          <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListRow({ list, count, canDelete }: { list: WatchlistRow; count: number; canDelete: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: list.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const active = useWatchlistPrefs((s) => s.activeListId) === list.id;

  const save = () => {
    useWatchlists.getState().renameList(list.id, name);
    setEditing(false);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group flex h-9 items-center gap-1.5 rounded-control px-1.5 hover:bg-hover",
        isDragging && "relative z-10 bg-elevated shadow-popover",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Reorder ${list.name}`}
        className="flex size-6 cursor-grab items-center justify-center rounded-[5px] text-fg-subtle hover:text-fg active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {editing ? (
        <Input
          autoFocus
          aria-label="List name"
          value={name}
          maxLength={80}
          className="h-7"
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setName(list.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => useWatchlistPrefs.getState().setActiveList(list.id)}
          onDoubleClick={() => setEditing(true)}
        >
          <span className={cn("truncate text-ui", active ? "font-semibold text-fg" : "text-fg")}>
            {list.name}
          </span>
          <span className="num text-cell text-fg-subtle">{count}</span>
        </button>
      )}
      <div className="flex opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton
          size="xs"
          label={`Rename ${list.name}`}
          icon={<Pencil />}
          onClick={() => setEditing(true)}
        />
        <IconButton
          size="xs"
          label={`Duplicate ${list.name}`}
          icon={<Copy />}
          onClick={() => useWatchlists.getState().duplicateList(list.id)}
        />
        <IconButton
          size="xs"
          label={`Delete ${list.name}`}
          icon={<Trash2 />}
          disabled={!canDelete}
          onClick={() => deleteListWithUndo(list.id)}
        />
      </div>
    </li>
  );
}
