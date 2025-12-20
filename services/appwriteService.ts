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
    console.error("Connection Validation Error:", error);
    
    let errorMessage = error.message || "Unknown error occurred";
    
    // Make common errors friendlier
    if (errorMessage.includes("Network Error") || errorMessage.includes("Failed to fetch")) {
      errorMessage = "Network Error: Cannot reach Appwrite. 1) Check your Endpoint URL. 2) Ensure your current hostname is added to Platforms in Appwrite.";
    } else if (errorMessage.includes("project")) {
       errorMessage = "Invalid Project ID. Please check the ID in Settings.";
    } else if (errorMessage.includes("bucket")) {
       errorMessage = "Invalid Bucket ID or Bucket not found.";
    } else if (errorMessage.includes("401")) {
       errorMessage = "Unauthorized: Check Bucket permissions (Role: Any needs Read access).";
    }

    return { isValid: false, error: errorMessage };
  }
};