import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { pendingCount, visible } from "../sync/core";
import { useApp } from "../store";
import { Button, colors, s, severityColor, SyncBanner } from "../ui";

export function List({ open }: { open: (id: string | null) => void }) {
  const { state, status, syncNow, signOut } = useApp();
  const items = visible(state);

  return (
    <View style={s.screen}>
      <Text style={s.h1}>Inspections</Text>
      <SyncBanner status={status} pending={pendingCount(state)} />
      {state.lastConflicts.length > 0 && (
        <View style={[s.card, { borderColor: colors.warn }]}>
          <Text style={{ color: colors.warn, fontWeight: "600" }}>
            {state.lastConflicts.length} edit(s) were superseded by a newer change on another device.
          </Text>
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={status === "syncing"} onRefresh={syncNow} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={{ color: colors.muted }}>No inspections yet. Create one — it works offline.</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => open(item.id)} style={s.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600", flex: 1 }}>{item.title || "Untitled"}</Text>
              <Text style={{ color: severityColor(item.severity), fontWeight: "700" }}>S{item.severity}</Text>
            </View>
            <Text style={{ color: colors.muted, marginTop: 4 }}>
              {item.site || "No site"} · {item.status.replace("_", " ")} · {item.photos.length} photo(s)
              {state.pending[item.id] ? " · ⏳ unsynced" : ""}
            </Text>
          </Pressable>
        )}
      />
      <Button title="New inspection" onPress={() => open(null)} />
      <Button title="Sign out" kind="ghost" onPress={signOut} />
    </View>
  );
}
