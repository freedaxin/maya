cov:
	rm -fr ./src.jsc
	jscoverage src/ src.jsc --exclude package.json
	NODE_PATH=${NODE_PATH}:$(CURDIR)/src.jsc mocha -R html-cov test/ut/*.js > maya_cov.html

ut:
	NODE_PATH=${NODE_PATH}:$(CURDIR)/src mocha -R spec test/ut/*.js

ft:
	@python26 test/ft/test_result.py

tag:
	sed -i '10s/_version.*/_version               $(shell echo $v|cut -c 2-)/g' maya.spec
	sed -i '3s/:.*/: "$(shell echo $v|cut -c 2-)",/g' src/package.json
	git add -u
	git commit --amend -C HEAD
	git tag -f $v

zip:
	git archive --prefix=maya-$(shell git describe --tag|cut -c 2-)/ -o maya-$(shell git describe --tag|cut -c 2-).zip $(shell git describe --tag)

rpm: zip
	echo %_topdir /tmp/redhat > ~/.rpmmacros
	mkdir -p /tmp/redhat/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
	cp maya.spec /tmp/redhat/SPECS/
	cp maya-$(shell git describe --tag|cut -c 2-).zip /tmp/redhat/SOURCES/
	rpmbuild -bb maya.spec
	cp /tmp/redhat/RPMS/x86_64/sinasrv2-maya-$(shell git describe --tag|cut -c 2-)-1.x86_64.rpm .

yum: rpm
	ssh root@10.210.226.48 "cd /data0/shangbin/2.3.1rpms;./rydown.sh"
	scp sinasrv2-maya-$(shell git describe --tag|cut -c 2-)-1.x86_64.rpm root@10.210.226.48:/data0/shangbin/2.3.1rpms/x86_64/RPMS
	ssh root@10.210.226.48 "cd /data0/shangbin/2.3.1rpms/x86_64;createrepo -g repodata/yumgroups-sinasrv2.xml .;cd ..;./ryup.sh"

clean:
	-@rm *.zip
	-@rm *.rpm
