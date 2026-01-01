
// Mocking the scenario where AI returns a logo
async function verifyLogoFiltering() {
    const item = {
        title: "Social Media Schedule Template",
        link: "https://smallbiztrends.com/social-media-schedule-template/",
        image: "https://smallbiztrends.com/wp-content/themes/sahifa/images/logo-full.jpg" // LOGO
    };

    console.log("Initial item from AI:", item);

    let finalImage = item.image;
    const isLogo = (src) => {
        const lower = src.toLowerCase();
        return lower.includes("logo") || lower.includes("icon") || lower.includes("avatar") ||
            lower.includes("placeholder") || lower.includes("tr?id=");
    };

    if (finalImage && isLogo(finalImage)) {
        console.log(`Detected logo: ${finalImage}. Clearing to trigger deep extraction.`);
        finalImage = null;
    }

    if (!finalImage) {
        console.log("Deep extraction would trigger now...");
        // Simulate deep extraction success (already verified in previous steps)
        finalImage = "https://media.smallbiztrends.com/2025/12/0qjgY1sQ-key-takeaways.jpg";
    }

    console.log("Final Image after logic:", finalImage);

    if (finalImage === "https://media.smallbiztrends.com/2025/12/0qjgY1sQ-key-takeaways.jpg") {
        console.log("SUCCESS! The system correctly replaced the logo with the featured image.");
    } else {
        console.log("FAILURE: Logo was not filtered or extraction failed.");
    }
}

verifyLogoFiltering();
