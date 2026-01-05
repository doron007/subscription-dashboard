import * as pdfjsLib from 'pdfjs-dist';

// Set worker source
// valid for nextjs public folder or CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function convertPdfToImages(file: File, maxPages = 3): Promise<string[]> {
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
