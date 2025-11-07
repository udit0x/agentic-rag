/**
 * @deprecated This hook is deprecated. Use useUploadContext from @/contexts/upload-context instead.
 * This file is kept for backward compatibility but will be removed in a future version.
 */

import { useUploadContext } from "@/contexts/upload-context";

export function useUploadProgress() {
  console.warn(
    "useUploadProgress is deprecated. Please use useUploadContext from @/contexts/upload-context instead."
  );
  return useUploadContext();
}