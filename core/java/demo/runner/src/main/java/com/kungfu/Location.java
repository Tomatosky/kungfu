package com.kungfu;

public class Location {
    int uid;
    String uname;
    String group;
    String name;
    Category category;
    Mode mode;

    public Location(int uid,  String uname, String group, String name, Category category, Mode mode) {
        this.uid = uid;
        this.uname = uname;
        this.group = group;
        this.name = name;
        this.category = category;
        this.mode = mode;
    }

    public int getUid() {
        return uid;
    }

    public void setUid(int uid) {
        this.uid = uid;
    }

    public String getUname() {
        return uname;
    }

    public void setUname(String uname) {
        this.uname = uname;
    }

    public String getGroup() {
        return group;
    }

    public void setGroup(String group) {
        this.group = group;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Category getCategory() {
        return category;
    }

    public void setCategory(Category category) {
        this.category = category;
    }

    public Mode getMode() {
        return mode;
    }

    public void setMode(Mode mode) {
        this.mode = mode;
    }
}
