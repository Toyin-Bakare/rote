<%@page import="com.ibm.security.appscan.altoromutual.model.Account"%>
<%@page import="com.ibm.security.appscan.altoromutual.model.User"%>
<%@ page language="java" contentType="text/html; charset=ISO-8859-1" pageEncoding="ISO-8859-1"%>
<%
User user = (User)request.getSession().getAttribute("user");
String token = java.util.UUID.randomUUID().toString().replaceAll("[^A-Za-z0-9]", "");
token = token.substring(0, Math.min(10, token.length()));
%>
<!DOCTYPE html>
<html>
<head>
  <title>Account Console</title>
  <style>
    body { font-family: Arial, sans-serif; background:#f4f1e8; margin:0; padding:16px; }
    table { border-collapse:collapse; width:100%; background:white; }
    td { border:1px solid #9d927a; padding:12px; }
    .console-title { background:#3f4e5e; color:white; font-weight:bold; }
  </style>
</head>
<body>
  <table>
    <tr><td class="console-title" colspan="2">Legacy Account Console</td></tr>
    <tr>
      <td>Account record</td>
      <td>
        <form method="get" action="challengeBalance.jsp">
          <input type="text" id="record_<%=token%>" name="record_<%=token%>" value="800002">
          <input type="submit" id="inspect_<%=token%>" value="Inspect">
        </form>
      </td>
    </tr>
    <tr><td colspan="2">The account result opens inside this nested legacy panel.</td></tr>
  </table>
</body>
</html>
