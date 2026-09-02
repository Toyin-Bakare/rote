FROM gradle:3.5-jdk8 AS build

WORKDIR /project
COPY . .
RUN gradle war --no-daemon

FROM tomcat:8.5-jdk8-temurin
COPY --from=build /project/build/libs/altoromutual.war /usr/local/tomcat/webapps/altoromutual.war
EXPOSE 8080

