/// <reference types="@capacitor/local-notifications" />
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.committed.app",
  appName: "Committed",
  webDir: "out",
  backgroundColor: "#000000",
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      style: "DEFAULT",
      hidden: false,
      animation: "NONE",
    },
    FirebaseAuthentication: {
      // Google account selection happens natively; the returned credential is
      // then exchanged with the existing Firebase JavaScript SDK for Firestore.
      skipNativeAuth: true,
      providers: ["google.com"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_committed",
      iconColor: "#41E987",
    },
  },
};

export default config;
