import * as ImagePicker from "expo-image-picker";
import React, { useRef } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Status } from "../sync/core";
import { useApp } from "../store";
import { Button, colors, s, severityColor } from "../ui";

const STATUSES: Status[] = ["open", "in_review", "closed"];

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function Edit({ id: existing, close }: { id: string | null; close: () => void }) {
  const { state, edit, addPhoto } = useApp();
  const id = useRef(existing ?? uuid()).current; // client-generated ID => creating works offline
  const rec = state.records[id];

  const field = (k: "title" | "site" | "notes", label: string, multiline = false) => (
    <>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { minHeight: 110, textAlignVertical: "top" }]}
        multiline={multiline}
        value={rec?.[k] ?? ""}
        onChangeText={(v) => edit(id, { [k]: v })}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
      />
    </>
  );

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (!shot.canceled) {
      edit(id, {}); // ensure the record exists locally even if no text was entered
      addPhoto(id, shot.assets[0].uri);
    }
  };

  const queued = state.photoQueue.filter((p) => p.inspectionId === id).length;

  return (
    <ScrollView style={s.screen} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>{existing ? "Edit inspection" : "New inspection"}</Text>
      {field("title", "Title")}
      {field("site", "Site")}

      <Text style={s.label}>Severity</Text>
      <View style={s.row}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Severity ${n}`} onPress={() => edit(id, { severity: n })}
            style={[s.chip, rec?.severity === n && { backgroundColor: severityColor(n), borderColor: severityColor(n) }]}>
            <Text style={{ color: rec?.severity === n ? "#000" : colors.text }}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>Status</Text>
      <View style={s.row}>
        {STATUSES.map((st) => (
          <Pressable key={st} accessibilityRole="button" onPress={() => edit(id, { status: st })}
            style={[s.chip, rec?.status === st && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
            <Text style={{ color: colors.text }}>{st.replace("_", " ")}</Text>
          </Pressable>
        ))}
      </View>

      {field("notes", "Notes", true)}

      <Text style={s.label}>Photos</Text>
      <Text style={{ color: colors.muted }}>
        {rec?.photos.length ?? 0} uploaded{queued ? ` · ${queued} waiting for signal` : ""}
      </Text>
      <Button title="Take photo" onPress={takePhoto} />
      {existing && <Button title="Delete" kind="ghost" onPress={() => { edit(id, { deleted: true }); close(); }} />}
      <Button title="Done" onPress={close} />
    </ScrollView>
  );
}
