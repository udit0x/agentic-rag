import asyncio
from storage import storage

async def check_storage():
    try:
        chunks = await storage.getAllChunks()
        print(f'Total chunks in storage: {len(chunks)}')
        
        if len(chunks) > 0:
            print('First 3 chunks:')
            for i, chunk in enumerate(chunks[:3]):
                chunk_id = chunk.get("id", "N/A")
                filename = chunk.get("filename", "N/A")
                content = chunk.get("content", "")[:100]
                print(f'  {i+1}. ID: {chunk_id}')
                print(f'     File: {filename}')
                print(f'     Content: {content}...')
                print()
        else:
            print('No documents have been uploaded and processed yet.')
            print('\nTo fix this issue:')
            print('1. Upload documents through the UI')
            print('2. Ensure Azure Search is properly configured')
            print('3. Make sure documents are processed and indexed')
            
    except Exception as e:
        print(f'Error checking storage: {e}')
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(check_storage())