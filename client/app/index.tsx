import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import image from "../assets/images/image.jpg";
const { height } = Dimensions.get('window');

  const WELCOME_IMAGE_URI = image;

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={WELCOME_IMAGE_URI}
          style={styles.image}
          resizeMode="cover"
        />
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.8)", "#FFFFFF"]}
          style={styles.gradient}
        />
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.textCenter}>
          <Text style={styles.title}>You Are Not Alone</Text>
          <Text style={styles.amharicTitle}>እርስዎ ብቻ አይዶሉም</Text>

          <Text style={styles.subtitle}>
            Safe and confidential support anytime
          </Text>
          <Text style={styles.amharicSubtitle}>
            ደህንነቱ የተጠበቀ እና ሚስጥራዊ ድጋፍ በማንኛውም ጊዜ
          </Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.8}
          onPress={() => router.push("/login")}
        >
          <Text style={styles.buttonText}>Get Started / ይጀምሩ</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          By clicking Get Started, you agree to our{"\n"}Terms of Service and
          Privacy Policy.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  imageContainer: { height: height * 0.6, width: "100%", position: "relative" },
  image: { width: "100%", height: "100%" },
  gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: 150 },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
    paddingBottom: 40,
    marginTop: -20,
    zIndex: 10,
  },
  textCenter: { alignItems: "center" },
  title: { fontSize: 26, fontWeight: "800", color: "#111827", marginBottom: 4 },
  amharicTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#4ADE80",
    marginBottom: 16,
  },
  subtitle: { fontSize: 15, color: "#4B5563", marginBottom: 2 },
  amharicSubtitle: { fontSize: 13, color: "#6B7280" },
  button: {
    backgroundColor: "#4ADE80",
    borderRadius: 16,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
  },
  buttonText: { color: "#111827", fontSize: 16, fontWeight: "700" },
  disclaimer: {
    textAlign: "center",
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 16,
    lineHeight: 18,
  },
});
