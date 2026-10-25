import React, { createContext, useContext } from 'react';
import { SharedValue, useSharedValue } from 'react-native-reanimated';

/** 0 = expanded dock, 1 = collapsed to two small buttons. Driven by scroll direction. */
const DockCollapse = createContext<SharedValue<number> | null>(null);

export function DockProvider({ children }: { children: React.ReactNode }) {
  const collapsed = useSharedValue(0);
  return <DockCollapse.Provider value={collapsed}>{children}</DockCollapse.Provider>;
}

export function useDockCollapse(): SharedValue<number> | null {
  return useContext(DockCollapse);
}
