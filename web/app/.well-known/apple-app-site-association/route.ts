import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.IOS_APP_TEAM_ID;
  if (!teamId) {
    return NextResponse.json(
      { error: "IOS_APP_TEAM_ID is not configured" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: `${teamId}.com.invoisio.mobile`,
          components: [
            { "/": "/invoice/*" },
            { "/": "/payment/*" },
            { "/": "/pay/*" },
            { "/": "/receipt/*" },
          ],
        },
      ],
    },
  });
}
