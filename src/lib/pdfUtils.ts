
export async function convertPdfToImages(file: File, maxPages = 3): Promise<string[]> {
    // Dynamic import to avoid build issues with server-side rendering
    const pdfjsLib = await import('pdfjs-dist');

    // Set worker source
    // Ensure we use the version from the imported module
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pageCount = Math.min(pdf.numPages, maxPages);
    const images: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // 1.5x scale for clear text

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
            await page.render({ canvasContext: context, viewport }).promise;
            // High quality JPEG
            images.push(canvas.toDataURL('image/jpeg', 0.8));
        }
    }

    return images;
}
