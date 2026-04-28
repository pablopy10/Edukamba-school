import { useSelectedChild } from "@/context/SelectedChildContext";

export type ParentChild = {
  id: string;
  full_name: string;
  classroom_id: string | null;
  classroom_name: string | null;
};

/**
 * Returns the list of students whose parent_id is the current user.
 * `childIds` and `classroomIds` are SCOPED to the currently selected child
 * (chosen via the global Topbar switcher). When no child is selected, it
 * falls back to all children. Use `allChildIds` when you need every child.
 */
export const useParentChildren = () => {
  const { isParent, children, selectedChildId, selectedChild, loading } = useSelectedChild();

  const allChildIds = children.map((c) => c.id);
  const allClassroomIds = Array.from(
    new Set(children.map((c) => c.classroom_id).filter((x): x is string => !!x)),
  );

  // Scope to the selected child when one is chosen; otherwise expose all.
  const scoped = selectedChild ? [selectedChild] : children;
  const childIds = scoped.map((c) => c.id);
  const classroomIds = Array.from(
    new Set(scoped.map((c) => c.classroom_id).filter((x): x is string => !!x)),
  );

  return {
    isParent,
    children,
    childIds,
    classroomIds,
    allChildIds,
    allClassroomIds,
    selectedChildId,
    selectedChild,
    loading,
  };
};