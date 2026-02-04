export default async (request, context) => {
  const url = new URL(request.url);

  if (url.pathname === "/140072") {

    const response = new Response(null, {
      status: 302,
      headers: {
        Location: "/",
      },
    });

    context.cookies.set({
      name: "bypass_maintenance",
      value: "true",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  }

  const cookie = context.cookies.get("bypass_maintenance");
  if (cookie) {
    return context.next();
  }

  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|ico|json|woff2)$/)) {
    return context.next();
  }

  return context.rewrite("/maintenance.html");
};