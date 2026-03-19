// Table of Contents utility

export interface Heading {
  id: string;
  level: number;
  title: string;
}

/**
 * Extract headings from HTML content
 * Generates an ID for each heading based on its text content
 */
export function extractHeadings(htmlContent: string): Heading[] {
  const headings: Heading[] = [];
  const parser = new DOMParser();
  
  try {
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const headingElements = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    let headingCounter = 0;
    
    headingElements.forEach((element) => {
      const level = parseInt(element.tagName[1]);
      const title = element.textContent || '';
      
      if (title.trim()) {
        headingCounter++;
        const id = `heading-${headingCounter}`;
        headings.push({ id, level, title });
      }
    });
  } catch (error) {
    console.error('Error parsing HTML for TOC:', error);
  }
  
  return headings;
}

/**
 * Add IDs to headings in HTML content for anchor linking
 */
export function addHeadingIds(htmlContent: string): string {
  const parser = new DOMParser();
  
  try {
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const headingElements = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    let headingCounter = 0;
    
    headingElements.forEach((element) => {
      const title = element.textContent || '';
      if (title.trim()) {
        headingCounter++;
        element.id = `heading-${headingCounter}`;
      }
    });
    
    // Serialize back to HTML string
    let resultHtml = '';
    doc.body.childNodes.forEach((node) => {
      if (node.nodeType === 1) { // Element node
        resultHtml += (node as Element).outerHTML;
      } else if (node.nodeType === 3 && node.textContent?.trim()) { // Text node
        resultHtml += node.textContent;
      }
    });
    
    return resultHtml || htmlContent;
  } catch (error) {
    console.error('Error adding heading IDs:', error);
    return htmlContent;
  }
}
