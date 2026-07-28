import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useApp } from "@/lib/store";
import { UserRole } from "@/lib/types";

const ROLE_HOME: Record<UserRole, string> = {
  CUSTOMER: "/(customer)",
  VENDOR: "/(vendor)",
  DELIVERY: "/(delivery)",
  FRANCHISE: "/(franchise)",
  MARKETING: "/(marketing)",
  SUPER_ADMIN: "/(admin)",
};

interface RoleGuardProps {
  requiredRole: UserRole;
  children: React.ReactNode;
}

export default function RoleGuard({ requiredRole, children }: RoleGuardProps) {
  const { initialized, user } = useApp();

  useEffect(() => {
    if (!initialized) return;
    if (!user || user.phone === "guest") {
      router.replace("/auth");
      return;
    }
    if (user.role !== requiredRole) {
      const correctHome = ROLE_HOME[user.role as UserRole] || "/(customer)";
      router.replace(correctHome as any);
    }
  }, [initialized, user, requiredRole]);

  if (!initialized || !user || user.phone === "guest" || user.role !== requiredRole) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF" }}>
        <ActivityIndicator color="#FF6B00" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}
