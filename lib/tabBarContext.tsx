import React, { createContext, useContext, useRef } from "react";
import { Animated } from "react-native";

interface TabBarContextType {
  translateY: Animated.Value;
  hideTabBar: () => void;
  showTabBar: () => void;
  lastScrollY: React.MutableRefObject<number>;
  isHidden: React.MutableRefObject<boolean>;
}

const TabBarContext = createContext<TabBarContextType | null>(null);

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const isHidden = useRef(false);

  const hideTabBar = () => {
    if (isHidden.current) return;
    isHidden.current = true;
    Animated.spring(translateY, {
      toValue: 100,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  const showTabBar = () => {
    if (!isHidden.current) return;
    isHidden.current = false;
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  return (
    <TabBarContext.Provider value={{ translateY, hideTabBar, showTabBar, lastScrollY, isHidden }}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  const ctx = useContext(TabBarContext);
  if (!ctx) {
    return {
      translateY: new Animated.Value(0),
      hideTabBar: () => {},
      showTabBar: () => {},
      lastScrollY: { current: 0 },
      isHidden: { current: false },
    };
  }
  return ctx;
}
