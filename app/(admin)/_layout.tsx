import { Stack } from "expo-router";
import React from "react";
import RoleGuard from "@/components/RoleGuard";

export default function AdminLayout() {
  return (
    <RoleGuard requiredRole="SUPER_ADMIN">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}
