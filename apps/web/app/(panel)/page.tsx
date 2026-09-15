import { parseWebPublicEnvironment } from "@aramayo/configuration/web";

import { TodayBoard } from "./today-board";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  const configuration = parseWebPublicEnvironment(process.env);
  return <TodayBoard apiBaseUrl={configuration.apiBaseUrl} />;
}
