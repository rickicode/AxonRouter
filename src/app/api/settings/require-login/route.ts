import { NextResponse } from "next/server";
import { getCurrentSettings } from "@/lib/settingsAccess";

export async function GET() {
	try {
		const settings = await getCurrentSettings();
		const hasPassword = !!settings?.password;
		return NextResponse.json({
			hasPassword,
		});
	} catch (error) {
		console.error("Error checking login settings requirement:", error);
		return NextResponse.json(
			{ hasPassword: true },
			{ status: 200 }
		);
	}
}
