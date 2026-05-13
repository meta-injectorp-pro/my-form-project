export default async (request, context) => {
    const url = new URL(request.url);

    // 👇 GitHub theke On/Off korar switch
    // true = Affiliate system bondho thakbe (Commission jabe na)
    // false = Affiliate system normal cholbe
    const isMaintenanceMode = true; 

    // Jodi maintenance off thake, normal vabe cholte dibe
    if (!isMaintenanceMode) {
        return context.next();
    }

    // ১. add-commission API ke eikhan thekei silent 200 OK diye block kora
    if (url.pathname.includes("/add-commission")) {
        return new Response(JSON.stringify({ 
            status: "success", 
            message: "Affiliate system is paused silently." 
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }

    // ২. submit-form API er jonno ekta hidden header add kore dewa
    if (url.pathname.includes("/submit-form")) {
        const modifiedRequest = new Request(request);
        modifiedRequest.headers.set("x-affiliate-maintenance", "true");
        return context.next(modifiedRequest);
    }

    return context.next();
};