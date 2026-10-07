import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SyncStatus } from "./store";

export const colors = {
  bg: "#0f1419",
  card: "#1a212b",
  border: "#2a3441",
  text: "#e8edf2",
  muted: "#8b98a8",
  accent: "#3b9eff",
  danger: "#ff5d5d",
  ok: "#3ddc97",
  warn: "#ffb84d",
};

export const severityColor = (n: number) => [colors.ok, colors.ok, colors.warn, colors.warn, colors.danger, colors.danger][n] ?? colors.muted;

export function Button({ title, onPress, kind = "primary" }: { title: string; onPress: () => void; kind?: "primary" | "ghost" }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.btn, kind === "ghost" && s.ghost, pressed && { opacity: 0.7 }]}
    >
      <Text style={[s.btnText, kind === "ghost" && { color: colors.accent }]}>{title}</Text>
    </Pressable>
  );
}

const LABEL: Record<SyncStatus, [string, string]> = {
  idle: ["All changes synced", colors.ok],
  syncing: ["Syncing…", colors.accent],
  offline: ["Offline — changes saved on device", colors.warn],
  error: ["Sync failed — will retry", colors.danger],
};

export function SyncBanner({ status, pending }: { status: SyncStatus; pending: number }) {
  const [text, color] = LABEL[status];
  return (
    <View style={[s.banner, { borderColor: color }]} accessibilityLiveRegion="polite">
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={{ color: colors.text, flex: 1 }}>{text}</Text>
      {pending > 0 && <Text style={{ color: colors.muted }}>{pending} pending</Text>}
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  h1: { color: colors.text, fontSize: 24, fontWeight: "700", marginBottom: 12 },
  label: { color: colors.muted, fontSize: 12, marginTop: 12, marginBottom: 4, textTransform: "uppercase" },
  input: { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, padding: 14, alignItems: "center", marginTop: 12 },
  ghost: { backgroundColor: "transparent" },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
});
