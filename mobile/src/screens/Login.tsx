import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useApp } from "../store";
import { Button, colors, s } from "../ui";

export function Login() {
  const { signIn } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const go = (mode: "login" | "register") => async () => {
    setError("");
    try {
      await signIn(mode, email.trim(), password);
    } catch (e) {
      setError(mode === "login" ? "Check your email and password." : "Couldn't create that account.");
    }
  };

  return (
    <View style={[s.screen, { justifyContent: "center" }]}>
      <Text style={s.h1}>SiteSync</Text>
      <Text style={{ color: colors.muted, marginBottom: 16 }}>Field inspections that work without signal.</Text>
      <TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.muted} autoCapitalize="none"
        keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <View style={{ height: 10 }} />
      <TextInput style={s.input} placeholder="Password (8+ characters)" placeholderTextColor={colors.muted} secureTextEntry
        value={password} onChangeText={setPassword} accessibilityLabel="Password" />
      {!!error && <Text style={{ color: colors.danger, marginTop: 8 }}>{error}</Text>}
      <Button title="Sign in" onPress={go("login")} />
      <Button title="Create account" kind="ghost" onPress={go("register")} />
    </View>
  );
}
