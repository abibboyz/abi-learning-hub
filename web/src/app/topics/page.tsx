import { redirect } from "next/navigation";

export default function TopicsRedirect() {
  redirect("/lab?mode=topics");
}
