import initializeApp from "./shared/services/initializeApp";

async function startServer() {
  console.log("Starting server...");
  
  try {
    await initializeApp();
    console.log("Server initialized");
  } catch (error) {
    // AUTOFIX F03: use console.error for error-level events
    console.error("Error initializing server:", error);
    process.exit(1);
  }
}

startServer().catch(console.error);

export default startServer;
