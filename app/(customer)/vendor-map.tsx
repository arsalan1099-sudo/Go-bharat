import React, { useState, useEffect } from "react";
import { categories as staticCategories, vendors as staticVendors } from "@/lib/data";
import { Vendor } from "@/lib/types";
import { useApp } from "@/lib/store";
import { useTabBar } from "@/lib/tabBarContext";
import FullScreenVendorMap from "@/components/FullScreenVendorMap";

export default function VendorMapScreen() {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const { liveVendors, liveCategories } = useApp();
  const { hideTabBar, showTabBar } = useTabBar();

  useEffect(() => {
    hideTabBar();
    return () => { showTabBar(); };
  }, []);

  const categories = liveCategories.length > 0 ? liveCategories : staticCategories;
  const allVendors = liveVendors.length > 0 ? liveVendors : staticVendors;

  return (
    <FullScreenVendorMap
      vendors={allVendors}
      categories={categories}
      activeFilter={activeFilter}
      onFilterChange={setActiveFilter}
      selectedVendor={selectedVendor}
      onVendorSelect={setSelectedVendor}
    />
  );
}
