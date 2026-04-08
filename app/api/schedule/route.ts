import { NextRequest, NextResponse } from "next/server";
import { createTask, listTasks, deleteTask } from "@/lib/task-sdk";

export async function GET(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tasks = await listTasks(embedToken);
    return NextResponse.json(tasks);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { schedule_time = "08:00", timezone = "America/New_York" } = body;

  try {
    // Delete existing tasks first
    const existing = await listTasks(embedToken);
    for (const task of existing) {
      await deleteTask(task.id, embedToken);
    }

    const [hours, minutes] = schedule_time.split(":").map(Number);
    const cronExpr = `${minutes} ${hours} * * *`;

    const task = await createTask({
      name: "Daily Market Brief",
      schedule: cronExpr,
      callbackPath: "/api/cron/send-brief",
      timezone,
    }, embedToken);

    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
