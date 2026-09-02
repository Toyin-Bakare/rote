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
    
<jsp:include page="header.jspf"/>

<div id="wrapper" style="width: 99%;">
	<jsp:include page="/toc.jspf"/>
   <td valign="top" colspan="3" class="bb">
		<div class="fl" style="width: 99%;">
		
		<h1>Online Banking Login</h1>
		<%
		String challengeToken = java.util.UUID.randomUUID().toString().replaceAll("[^A-Za-z0-9]", "");
		challengeToken = challengeToken.substring(0, Math.min(10, challengeToken.length()));
		String challengeUserId = "member_" + challengeToken;
		String challengePasswordId = "access_" + challengeToken;
		String challengeSubmitId = "continue_" + challengeToken;
		%>
		
		<!-- To get the latest admin login, please contact SiteOps at 415-555-6159 -->
		<p><span id="_ctl0__ctl0_Content_Main_message" style="color:#FF0066;font-size:12pt;font-weight:bold;">
		<%
		java.lang.String error = (String)request.getSession(true).getAttribute("loginError");
		
		if (error != null && error.trim().length() > 0){
			request.getSession().removeAttribute("loginError");
			out.print(error);
		}
		%>
		</span></p>
		
		<form action="doLogin" method="post" name="login" id="login_<%=challengeToken%>" onsubmit="return prepareChallengeLogin();">
		  <input type="hidden" name="uid" id="server_uid_<%=challengeToken%>">
		  <input type="hidden" name="passw" id="server_passw_<%=challengeToken%>">
		  <table>
		    <tr>
		      <td>
		        Username:
		      </td>
		      <td>
		        <input type="text" id="<%=challengeUserId%>" name="field_<%=challengeUserId%>" value="" autocomplete="off" style="width: 150px;">
		      </td>
		      <td>
		      </td>
		    </tr>
		    <tr>
		      <td>
		        Password:
		      </td>
		      <td>
		        <input type="password" id="<%=challengePasswordId%>" name="field_<%=challengePasswordId%>" autocomplete="off" style="width: 150px;">
		        </td>
		    </tr>
		    <tr>
		        <td></td>
		        <td>
		          <input type="submit" id="<%=challengeSubmitId%>" name="action_<%=challengeToken%>" value="Continue">
		        </td>
		      </tr>
		  </table>
		</form>
		
		</div>
		
		<script type="text/javascript">
			function setfocus() {
			    document.getElementById("<%=challengeUserId%>").focus();
			}
			
			function prepareChallengeLogin() {
			    var visibleUser = document.getElementById("<%=challengeUserId%>");
			    var visiblePassword = document.getElementById("<%=challengePasswordId%>");
			    if (visibleUser.value.length && visiblePassword.value.length) {
			      document.getElementById("server_uid_<%=challengeToken%>").value = visibleUser.value;
			      document.getElementById("server_passw_<%=challengeToken%>").value = visiblePassword.value;
			      return true;
			    } else if (!(visibleUser.value.length)) {
			      visibleUser.focus();
			      alert ("You must enter a valid username");
			      return false;
			    } else {
			      visiblePassword.focus();
			      alert ("You must enter a valid password");
			      return false;
			    }
			}
			window.onload = setfocus;
		</script>
    </td>
</div>

<jsp:include page="footer.jspf"/>
