<%@ page language="java" contentType="text/html; charset=ISO-8859-1"
    pageEncoding="ISO-8859-1"%>

<%
/**
 This application is for demonstration use only. It contains known application security
vulnerabilities that were created expressly for demonstrating the functionality of
application security testing tools. These vulnerabilities may present risks to the
technical environment in which the application is installed. You must delete and
uninstall this demonstration application upon completion of the demonstration for
which it is intended. 

IBM DISCLAIMS ALL LIABILITY OF ANY KIND RESULTING FROM YOUR USE OF THE APPLICATION
OR YOUR FAILURE TO DELETE THE APPLICATION FROM YOUR ENVIRONMENT UPON COMPLETION OF
A DEMONSTRATION. IT IS YOUR RESPONSIBILITY TO DETERMINE IF THE PROGRAM IS APPROPRIATE
OR SAFE FOR YOUR TECHNICAL ENVIRONMENT. NEVER INSTALL THE APPLICATION IN A PRODUCTION
ENVIRONMENT. YOU ACKNOWLEDGE AND ACCEPT ALL RISKS ASSOCIATED WITH THE USE OF THE APPLICATION.

IBM AltoroJ
(c) Copyright IBM Corp. 2008, 2013 All Rights Reserved.
*/
%> 
    
<jsp:include page="/header.jspf"/>

<div id="wrapper" style="width: 99%;">
	<jsp:include page="membertoc.jspf"/>
	<td valign="top" colspan="3" class="bb">
		<%@page import="com.ibm.security.appscan.altoromutual.model.Account"%>
		<div class="fl" style="width: 99%;">
		
		<%
					com.ibm.security.appscan.altoromutual.model.User user = (com.ibm.security.appscan.altoromutual.model.User)request.getSession().getAttribute("user");
					String challengeToken = java.util.UUID.randomUUID().toString().replaceAll("[^A-Za-z0-9]", "");
					challengeToken = challengeToken.substring(0, Math.min(10, challengeToken.length()));
				%>
		
		<h1>Hello <%= user.getFirstName() + " " + user.getLastName() %>
		  </h1>
		
		<p>
		  Welcome to Altoro Mutual Online.
		</p>
		
		<p>Account details are provided through the legacy account console below.</p>
		<iframe id="account_console_<%=challengeToken%>" name="panel_<%=challengeToken%>"
		        src="challengeAccount.jsp" width="620" height="390" frameborder="0" scrolling="auto"></iframe>
		
		</div>
    </td>
</div>

<jsp:include page="/footer.jspf"/>	
