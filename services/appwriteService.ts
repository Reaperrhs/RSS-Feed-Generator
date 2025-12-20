import { Client, Storage, ID } from 'appwrite';
import { AppwriteConfig } from '../types';

let client: Client | null = null;
let storage: Storage | null = null;

const initialize = (config: AppwriteConfig) => {
  client = new Client()
    .setEndpoint(config.endpoint.trim())
    .setProject(config.projectId.trim());

  storage = new Storage(client);
};

export const uploadXMLToAppwrite = async (
  xmlContent: string,
  fileName: string,
  config: AppwriteConfig
): Promise<{ fileId: string; viewUrl: string }> => {
  if (!client || !storage) {
    initialize(config);
  }

  try {
    const file = new File([xmlContent], fileName, { type: 'application/xml' });

    // Upload file
    const result = await storage!.createFile(
      config.bucketId.trim(),
      ID.unique(),
      file
    );

    // Get View URL
    const viewUrl = storage!.getFileView(
      config.bucketId.trim(),
      result.$id
    ).href;

    return {
      fileId: result.$id,
      viewUrl: viewUrl
    };
  } catch (error: any) {
    console.error("Appwrite Upload Error:", error);
    throw new Error(error.message || "Failed to upload to Appwrite.");
  }
};

export const validateConnection = async (config: AppwriteConfig): Promise<{ isValid: boolean; error?: string }> => {
  // Re-initialize with new config to ensure we test what's passed
  initialize(config);

  try {
    // Try to list files in the bucket. This verifies Endpoint, Project ID, and Bucket ID all at once.
    await storage!.listFiles(config.bucketId.trim(), []);
    return { isValid: true };
  } catch (error: any) {
    console.error("Connection Validation Error Detail:", {
      message: error.message,
      code: error.code,
      type: error.type,
      config: { ...config, projectId: config.projectId.substring(0, 5) + '...' }
    });

    let errorMessage = error.message || "Unknown error occurred";
    const errorType = error.type || "";

    // Check for common Appwrite error types
    if (errorMessage.includes("Network Error") || errorMessage.includes("Failed to fetch") || error.code === 0) {
      errorMessage = "Network Error: The browser cannot reach your Appwrite endpoint. This usually means: 1) Your Appwrite endpoint is incorrect, or 2) You haven't added your domain to 'Platforms' in Appwrite Settings.";
    } else if (errorType === "project_not_found" || errorMessage.includes("project")) {
      errorMessage = "Project Not Found: Please check your Project ID. It should be an alphanumeric string from the Appwrite Console.";
    } else if (errorMessage.includes("bucket") || errorType === "storage_bucket_not_found") {
      errorMessage = "Bucket Not Found: Ensure the Storage Bucket ID exists and is correct.";
    } else if (error.code === 401 || errorType === "user_unauthorized") {
      errorMessage = "Permission Denied: Ensure your Bucket has 'Any' role with 'Read' permissions in the Settings tab of the bucket.";
    } else if (error.code === 403) {
      errorMessage = "Access Forbidden: Check your Appwrite Project settings and CORS/Platform configuration.";
    }

    return { isValid: false, error: errorMessage };
  }
};