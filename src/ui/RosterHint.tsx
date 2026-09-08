'use client';

import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Lets the status page point the header's "Admin roster" tab at itself once a
 * booking is confirmed.
 *
 * The two live in different trees - the header is rendered by the layout, the
 * outcome is known by the page - so the page raises a flag and the header
 * decides how to draw it. Nothing here affects what the system permits; it is
 * a signpost between two views of the same seat.
 */
interface RosterHint {
  classId: string | null;
  setClassId: (classId: string | null) => void;
}

const RosterHintContext = createContext<RosterHint>({ classId: null, setClassId: () => {} });

export function RosterHintProvider({ children }: { children: React.ReactNode }) {
  const [classId, setClassId] = useState<string | null>(null);
  return (
    <RosterHintContext.Provider value={{ classId, setClassId }}>
      {children}
    </RosterHintContext.Provider>
  );
}

export function useRosterHint(): RosterHint {
  return useContext(RosterHintContext);
}

/**
 * Rendered by the status page for a confirmed booking. Clears itself on
 * unmount, so navigating away takes the hint with it.
 */
export function RosterHintTrigger({ classId }: { classId: string }) {
  const { setClassId } = useRosterHint();

  useEffect(() => {
    setClassId(classId);
    return () => setClassId(null);
  }, [classId, setClassId]);

  return null;
}
