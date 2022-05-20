package com.kungfu;

public class Deregister {
    int location_uid;                         //
    Category category;                      //
    Mode mode;                              //
    String group;                             //
    String name;

    public int getLocation_uid() {
        return location_uid;
    }

    public void setLocation_uid(int location_uid) {
        this.location_uid = location_uid;
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

    public Deregister(int location_uid, Category category, Mode mode, String group, String name) {
        this.location_uid = location_uid;
        this.category = category;
        this.mode = mode;
        this.group = group;
        this.name = name;
    }
}
